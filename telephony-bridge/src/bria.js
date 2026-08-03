const { EventEmitter } = require("node:events");
const WebSocket = require("ws");
const { log, sleep } = require("./util.js");

// ============================================================================
//  Bria Desktop API-klient (protokoll bekreftet mot CounterPaths offisielle
//  JavaScript-eksempel: github.com/CounterPath/DesktopAPI_1.2_Javascript_Sample).
//
//  • Endepunkt (fast):
//      wss://cpclientapi.softphone.com:9002/counterpath/socketapi/v1/
//    Vertsnavnet peker på loopback (127.0.0.1) og har et gyldig TLS-sertifikat,
//    slik at wss valideres selv om Bria kjører lokalt. Krever Bria 5.0+ (5.3+
//    anbefalt) med API-tilgang aktivert (Preferences → Application → Security →
//    «Allow access always»).
//
//  • Forespørsler er HTTP-lignende tekst-rammer over WebSocket:
//      GET /status\r\nUser-Agent: …\r\nTransaction-ID: N\r\n
//      Content-Type: application/xml\r\nContent-Length: L\r\n\r\n<xml>
//
//  • Flyt: ved tilkobling ber vi om samtalestatus (GET /status). Bria sender
//    «statusChange»-hendelser når noe endrer seg; da ber vi om status på nytt
//    og leser <call>-blokkene.
//
//  Sender ut normaliserte events:  emit("call", { id, state, remote })
//     state: "started" | "answered" | "ended"
// ============================================================================

const DEFAULT_URL =
  "wss://cpclientapi.softphone.com:9002/counterpath/socketapi/v1/";

class BriaClient extends EventEmitter {
  constructor({ url, user, password }) {
    super();
    this.url = url || DEFAULT_URL;
    this.user = user;
    this.password = password;
    this.ws = null;
    this.stopped = false;
    this.backoff = 1000;
    this.txId = 1;
    // Kjente aktive samtaler: id -> normalisert state ("started"/"answered")
    this.calls = new Map();
  }

  start() {
    this.stopped = false;
    this._connect();
  }

  stop() {
    this.stopped = true;
    if (this.ws) this.ws.close();
  }

  _connect() {
    log.info(`Kobler til Bria på ${this.url} …`);
    const headers = {};
    if (this.user) {
      const basic = Buffer.from(`${this.user}:${this.password ?? ""}`).toString("base64");
      headers.Authorization = `Basic ${basic}`;
    }
    // rejectUnauthorized: false som sikkerhetsnett dersom et eldre Bria bruker
    // et selvsignert lokalt sertifikat.
    this.ws = new WebSocket(this.url, { rejectUnauthorized: false, headers });

    this.ws.on("open", () => {
      log.info("Tilkoblet Bria.");
      this.backoff = 1000;
      this.calls.clear();
      this.emit("connected");
      this._requestCallStatus(); // hent nåværende samtalestatus
    });

    this.ws.on("message", (data) => {
      const text = data.toString("utf8");
      log.debug("Bria →", text.replace(/\s+/g, " ").slice(0, 300));
      try {
        this._onFrame(text);
      } catch (e) {
        log.error("Kunne ikke tolke Bria-melding:", e.message);
      }
    });

    this.ws.on("close", () => {
      this.emit("disconnected");
      if (this.stopped) return;
      log.info(`Bria-forbindelse lukket. Prøver igjen om ${this.backoff} ms.`);
      this._reconnect();
    });

    this.ws.on("error", (e) => log.error("Bria WebSocket-feil:", e.message));
  }

  async _reconnect() {
    await sleep(this.backoff);
    this.backoff = Math.min(this.backoff * 2, 30000);
    if (!this.stopped) this._connect();
  }

  // Bygg og send en HTTP-lignende forespørsel over WebSocket.
  _send(method, endpoint, body = "") {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const len = Buffer.byteLength(body, "utf8");
    const frame =
      `${method} /${endpoint}\r\n` +
      `User-Agent: SalgssentralBridge/1.0\r\n` +
      `Transaction-ID: ${this.txId++}\r\n` +
      `Content-Type: application/xml\r\n` +
      `Content-Length: ${len}\r\n\r\n` +
      body;
    this.ws.send(frame);
  }

  // Be om samtalestatus. (Body-formatet kan variere mellom API-versjoner –
  // juster ved behov mot Developer Guide/eksempelet.)
  _requestCallStatus() {
    this._send("GET", "status", "<status><type>call</type></status>");
  }

  _onFrame(text) {
    const nl = text.indexOf("\r\n\r\n");
    const firstLine = text.slice(0, text.indexOf("\r\n") + 1);
    const body = nl >= 0 ? text.slice(nl + 4) : text;

    // 1) «statusChange»-hendelse -> be om oppdatert status.
    const isStatusChange =
      /statusChange/i.test(firstLine) ||
      /type\s*=\s*["']statusChange["']/i.test(text);
    if (isStatusChange && !/<call\b/i.test(body)) {
      this._requestCallStatus();
      return;
    }

    // 2) Statussvar med <call>-blokker -> avstem mot kjente samtaler.
    if (/<call\b/i.test(body) || /<status/i.test(body) || firstLine.startsWith("HTTP")) {
      this._reconcile(parseCalls(body));
    }
  }

  // Sammenlign nåværende samtaler mot forrige status og send ut endringer.
  _reconcile(calls) {
    const next = new Map();
    for (const c of calls) {
      const state = normalizeState(c.state);
      if (state === "ended") continue; // avsluttet -> tas via «forsvunnet» under
      if (!state) continue;
      next.set(c.id, { state, remote: c.number });
      const prev = this.calls.get(c.id);
      if (prev !== state) {
        this.emit("call", { id: c.id, state, remote: c.number });
      }
    }
    // Samtaler som var aktive, men ikke lenger finnes -> avsluttet.
    for (const [id] of this.calls) {
      if (!next.has(id)) {
        this.emit("call", { id, state: "ended", remote: null });
      }
    }
    this.calls = new Map([...next].map(([id, v]) => [id, v.state]));
  }
}

// ── XML-hjelpere ─────────────────────────────────────────────────────────────
// Trekk ut <call>-blokker med id, første deltakers state og nummer.
function parseCalls(xml) {
  const out = [];
  const callRe = /<call\b[^>]*>([\s\S]*?)<\/call>/gi;
  let m;
  while ((m = callRe.exec(xml))) {
    const block = m[1];
    const id =
      (block.match(/<id>([^<]*)<\/id>/i) || [])[1] ||
      (m[0].match(/\bid=["']([^"']+)["']/i) || [])[1];
    if (!id) continue;
    const state = (block.match(/<state>([^<]*)<\/state>/i) || [])[1] || "";
    const number = (block.match(/<number>([^<]*)<\/number>/i) || [])[1] || null;
    out.push({
      id: id.trim(),
      state: state.trim(),
      number: number ? number.trim() : null,
    });
  }
  return out;
}

// Bria-tilstander -> vårt enkle sett.
function normalizeState(s) {
  const v = (s || "").toLowerCase();
  if (/ring|incoming|connecting|trying|early|dialing|initiat/.test(v)) return "started";
  if (/connected|established|confirmed|answered/.test(v)) return "answered";
  if (/disconnect|ended|released|terminat|failed|missed|hangup/.test(v)) return "ended";
  return null;
}

module.exports = { BriaClient, parseCalls, normalizeState, DEFAULT_URL };
