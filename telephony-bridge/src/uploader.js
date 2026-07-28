const fsp = require("node:fs/promises");
const path = require("node:path");
const { log, sleep } = require("./util.js");

// ============================================================================
//  Opplaster med gjenforsøk-kø. Alt sendes over HTTPS til CRM-en med den delte
//  hemmeligheten i X-Webhook-Secret. Feiler noe (nett/serverhikke), legges
//  jobben bakerst i køen og prøves igjen med eksponentiell backoff – uten å
//  blokkere selgeren.
// ============================================================================

class Uploader {
  constructor({ baseUrl, secret }) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.secret = secret;
    this.queue = [];
    this.running = false;
  }

  enqueueEvent(payload) {
    this.queue.push({ kind: "event", payload, attempts: 0 });
    this._run();
  }

  enqueueRecording(meta) {
    this.queue.push({ kind: "recording", meta, attempts: 0 });
    this._run();
  }

  async _run() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const job = this.queue.shift();
      try {
        if (job.kind === "event") await this._postEvent(job.payload);
        else await this._postRecording(job.meta);
        log.info(`Opplasting OK (${job.kind}).`);
      } catch (e) {
        job.attempts += 1;
        const wait = Math.min(2000 * 2 ** (job.attempts - 1), 60000);
        log.error(
          `Opplasting feilet (${job.kind}, forsøk ${job.attempts}): ${e.message}. Nytt forsøk om ${wait} ms.`,
        );
        this.queue.push(job);
        await sleep(wait);
      }
    }
    this.running = false;
  }

  async _postEvent(payload) {
    const res = await fetch(`${this.baseUrl}/api/telephony/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": this.secret,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await safeText(res)}`);
  }

  async _postRecording(meta) {
    const buf = await fsp.readFile(meta.file);
    const form = new FormData();
    form.append("external_call_id", meta.external_call_id);
    if (meta.agent_id) form.append("agent_id", meta.agent_id);
    if (meta.extension) form.append("extension", meta.extension);
    form.append(
      "audio",
      new Blob([buf], { type: "application/octet-stream" }),
      path.basename(meta.file),
    );
    const res = await fetch(`${this.baseUrl}/api/telephony/recording`, {
      method: "POST",
      headers: { "X-Webhook-Secret": this.secret },
      body: form,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await safeText(res)}`);
  }
}

async function safeText(res) {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}

module.exports = { Uploader };
