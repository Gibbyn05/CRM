import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import chokidar from "chokidar";
import { log, sleep } from "./util.js";

// ============================================================================
//  Overvåker Bria sin opptaksmappe og kobler en ferdig opptaksfil til rett
//  samtale ut fra TIDSVINDU.
//
//  Nøkkelinnsikt: på én softphone er man bare i én samtale om gangen, så
//  filen som ble skrevet ferdig i samtalens tidsvindu er entydig den riktige.
// ============================================================================

const AUDIO_EXT = new Set([".wav", ".mp3", ".m4a", ".aac", ".ogg", ".opus"]);

export class RecordingWatcher {
  constructor({ dir }) {
    this.dir = dir;
    // filbane -> { mtimeMs, size }
    this.seen = new Map();
    this.watcher = null;
  }

  start() {
    if (!fs.existsSync(this.dir)) {
      log.error(`Opptaksmappa finnes ikke: ${this.dir} (sjekk RECORDINGS_DIR).`);
    }
    // Registrer eksisterende filer uten å trigge (ignoreInitial).
    this.watcher = chokidar.watch(this.dir, {
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 300 },
      depth: 2,
    });
    const track = (p, stats) => {
      if (!AUDIO_EXT.has(path.extname(p).toLowerCase())) return;
      this.seen.set(p, { mtimeMs: stats?.mtimeMs ?? Date.now(), size: stats?.size ?? 0 });
      log.debug("Opptaksfil registrert:", p);
    };
    this.watcher.on("add", track);
    this.watcher.on("change", track);
    log.info(`Overvåker opptaksmappe: ${this.dir}`);
  }

  stop() {
    if (this.watcher) this.watcher.close();
  }

  // Finn opptaksfila som hører til samtalen [startMs, endMs]. Venter litt slik
  // at Bria rekker å skrive ferdig fila etter at samtalen ble avsluttet.
  async findForCall(startMs, endMs, { graceMs = 8000, marginMs = 15000 } = {}) {
    await sleep(3000); // gi Bria tid til å lukke fila
    const deadline = Date.now() + graceMs;

    while (Date.now() < deadline) {
      const match = this._pick(startMs, endMs, marginMs);
      if (match) return match;
      await sleep(1000);
    }
    return this._pick(startMs, endMs, marginMs);
  }

  _pick(startMs, endMs, marginMs) {
    let best = null;
    for (const [file, meta] of this.seen) {
      // Fila må ha blitt sist endret innenfor samtalens vindu (+ margin).
      if (meta.mtimeMs >= startMs - marginMs && meta.mtimeMs <= endMs + marginMs) {
        if (meta.size > 0 && (!best || meta.mtimeMs > best.mtimeMs)) {
          best = { file, ...meta };
        }
      }
    }
    return best;
  }

  async remove(file) {
    try {
      await fsp.unlink(file);
      this.seen.delete(file);
      log.debug("Slettet lokal opptaksfil:", file);
    } catch (e) {
      log.error("Kunne ikke slette opptaksfil:", e.message);
    }
  }
}
