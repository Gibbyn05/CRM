#!/usr/bin/env node
import "dotenv/config";
import { BriaClient } from "./bria.js";
import { RecordingWatcher } from "./recordings.js";
import { Uploader } from "./uploader.js";
import { log } from "./util.js";

// ============================================================================
//  Salgssentral telefoni-bro
//
//  Kjører i bakgrunnen på én selger-PC. Lytter på Bria, sender samtale-
//  hendelser til CRM-en (logg + status), og laster opp opptaket når samtalen
//  er ferdig – slik at CRM-en kan transkribere og lage sammendrag.
//
//  Retning er ALLTID PC → CRM. Serveren når aldri inn på denne maskinen.
// ============================================================================

const cfg = {
  baseUrl: process.env.CRM_BASE_URL,
  secret: process.env.WEBHOOK_SECRET,
  agentId: process.env.AGENT_ID || null,
  extension: process.env.EXTENSION || null,
  briaUrl: process.env.BRIA_WS_URL,
  briaUser: process.env.BRIA_API_USER || null,
  briaPassword: process.env.BRIA_API_PASSWORD || null,
  recordingsDir: process.env.RECORDINGS_DIR,
  deleteAfterUpload: String(process.env.DELETE_AFTER_UPLOAD).toLowerCase() === "true",
};

function requireCfg(keys) {
  const missing = keys.filter((k) => !cfg[k]);
  if (missing.length) {
    log.error(`Mangler konfigurasjon: ${missing.join(", ")}. Se .env.example.`);
    process.exit(1);
  }
}
requireCfg(["baseUrl", "secret", "briaUrl", "recordingsDir"]);
if (!cfg.agentId && !cfg.extension) {
  log.error("Sett enten AGENT_ID eller EXTENSION i .env.");
  process.exit(1);
}

const uploader = new Uploader({ baseUrl: cfg.baseUrl, secret: cfg.secret });
const recordings = new RecordingWatcher({ dir: cfg.recordingsDir });
const bria = new BriaClient({
  url: cfg.briaUrl,
  user: cfg.briaUser,
  password: cfg.briaPassword,
});

// Aktive samtaler på denne PC-en: id -> { startMs, remote }
const active = new Map();

function eventPayload(type, call) {
  return {
    event_type: type, // call_started | call_answered | call_ended | call_missed
    external_call_id: call.id,
    agent_id: cfg.agentId ?? undefined,
    extension: cfg.extension ?? undefined,
    phone_number: call.remote ?? undefined,
    occurred_at: new Date().toISOString(),
  };
}

bria.on("call", async (call) => {
  log.info(`Samtale ${call.id}: ${call.state}${call.remote ? " (" + call.remote + ")" : ""}`);

  if (call.state === "started") {
    active.set(call.id, { startMs: Date.now(), remote: call.remote });
    uploader.enqueueEvent(eventPayload("call_started", call));
    return;
  }

  if (call.state === "answered") {
    uploader.enqueueEvent(eventPayload("call_answered", call));
    return;
  }

  if (call.state === "ended") {
    const info = active.get(call.id) ?? { startMs: Date.now() - 1000 };
    active.delete(call.id);
    uploader.enqueueEvent(eventPayload("call_ended", call));

    // Finn opptaket for denne samtalen og last det opp.
    const endMs = Date.now();
    const match = await recordings.findForCall(info.startMs, endMs);
    if (!match) {
      log.info(`Fant ingen opptaksfil for samtale ${call.id} (kort/ubesvart?).`);
      return;
    }
    log.info(`Kobler opptak til samtale ${call.id}: ${match.file}`);
    uploader.enqueueRecording({
      file: match.file,
      external_call_id: call.id,
      agent_id: cfg.agentId,
      extension: cfg.extension,
    });
    // Merk: fila slettes først etter at Uploader har bekreftet opplasting.
    if (cfg.deleteAfterUpload) {
      // Enkelt: gi opplastingen tid, så rydd. (For strengere garanti kan man
      // vente på en callback fra Uploader.)
      setTimeout(() => recordings.remove(match.file), 60000);
    }
  }
});

bria.on("connected", () => log.info("Klar – lytter på samtaler."));

recordings.start();
bria.start();

log.info("Salgssentral telefoni-bro startet.");

function shutdown() {
  log.info("Avslutter …");
  bria.stop();
  recordings.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
