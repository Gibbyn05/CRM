import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { log, sleep } from "./util.js";

// ============================================================================
//  Bria Desktop API-klient.
//
//  Kobler til Bria sin lokale WebSocket, holder forbindelsen i live (auto-
//  reconnect), tolker samtalehendelser og sender ut normaliserte events:
//
//     emit("call", { id, state, remote })
//        state: "started" | "answered" | "ended"
//        id:     Bria sin unike samtale-ID (idempotens-nøkkel mot CRM-en)
//        remote: motpartens nummer (Caller ID), hvis tilgjengelig
//
//  ⚠️  VIKTIG: Bria Desktop API sender XML-hendelser (statusChange) over
//  WebSocket. De NØYAKTIGE tag-/attributtnavnene og WS-URL/porten må
//  bekreftes mot «Bria Desktop API Developer Guide»
//  (https://www.counterpath.com/bria-desktop-api/ og
//  https://github.com/CounterPathAPI). Tolkningen under er bevisst tolerant
//  og samlet i parseBriaMessage() slik at det er ett sted å justere.
// ============================================================================

export class BriaClient extends EventEmitter {
  constructor({ url, user, password }) {
    super();
    this.url = url;
    this.user = user;
    this.password = password;
    this.ws = null;
    this.stopped = false;
    this.backoff = 1000;
    // Sist kjente tilstand per samtale-ID, for å unngå doble events.
    this.callState = new Map();
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
    // rejectUnauthorized: false – Bria bruker ofte et selvsignert lokalt sertifikat.
    const headers = {};
    if (this.user) {
      const basic = Buffer.from(`${this.user}:${this.password ?? ""}`).toString("base64");
      headers.Authorization = `Basic ${basic}`;
    }
    this.ws = new WebSocket(this.url, { rejectUnauthorized: false, headers });

    this.ws.on("open", () => {
      log.info("Tilkoblet Bria.");
      this.backoff = 1000;
      this.emit("connected");
      // Noen oppsett krever en eksplisitt «start events»-forespørsel. Legg den
      // ev. til her iht. Developer Guide, f.eks.:
      // this.ws.send('<request><statusChange enable="true"/></request>');
    });

    this.ws.on("message", (data) => {
      const text = data.toString("utf8");
      log.debug("Bria →", text);
      try {
        const evt = parseBriaMessage(text);
        if (evt) this._handle(evt);
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

    this.ws.on("error", (e) => {
      log.error("Bria WebSocket-feil:", e.message);
      // 'close' følger normalt etter 'error' og trigger reconnect.
    });
  }

  async _reconnect() {
    await sleep(this.backoff);
    this.backoff = Math.min(this.backoff * 2, 30000);
    if (!this.stopped) this._connect();
  }

  _handle(evt) {
    const prev = this.callState.get(evt.id);
    if (prev === evt.state) return; // dedupliser gjentatte statusmeldinger
    this.callState.set(evt.id, evt.state);
    this.emit("call", evt);
    if (evt.state === "ended") {
      // Rydd opp etter en liten stund.
      setTimeout(() => this.callState.delete(evt.id), 60000);
    }
  }
}

// ── XML-tolkning ────────────────────────────────────────────────────────────
// Trekker ut samtale-ID, tilstand og motpartsnummer fra en Bria statusChange-
// melding. JUSTER tag-/attributtnavn her mot Developer Guide ved behov.
export function parseBriaMessage(xml) {
  // Bare interessert i «call»-status-endringer.
  if (!/statusChange|<call/i.test(xml)) return null;

  const id = attr(xml, "callId") || attr(xml, "id") || tag(xml, "callId");
  if (!id) return null;

  const rawStatus = (
    attr(xml, "status") ||
    attr(xml, "state") ||
    tag(xml, "status") ||
    ""
  ).toLowerCase();

  const remote =
    attr(xml, "remoteNumber") ||
    attr(xml, "number") ||
    tag(xml, "remoteNumber") ||
    tag(xml, "number") ||
    null;

  const state = normalizeState(rawStatus);
  if (!state) return null;
  return { id, state, remote };
}

// Kartlegg Bria sine statusord til vårt enkle sett. Utvid ved behov.
function normalizeState(s) {
  if (/(dialing|ringing|incoming|start|early)/.test(s)) return "started";
  if (/(connected|answered|established|confirmed)/.test(s)) return "answered";
  if (/(ended|terminated|disconnected|released|hungup|failed|missed)/.test(s))
    return "ended";
  return null;
}

function attr(xml, name) {
  const m = xml.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return m ? m[1] : null;
}
function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([^<]+)</${name}>`, "i"));
  return m ? m[1] : null;
}
