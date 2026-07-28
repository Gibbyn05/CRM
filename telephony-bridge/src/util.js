// Små hjelpere: logger og sleep.

const LEVELS = { error: 0, info: 1, debug: 2 };
const current = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function ts() {
  return new Date().toISOString();
}

export const log = {
  error: (...a) => current >= LEVELS.error && console.error(`[${ts()}] ERROR`, ...a),
  info: (...a) => current >= LEVELS.info && console.log(`[${ts()}] INFO `, ...a),
  debug: (...a) => current >= LEVELS.debug && console.log(`[${ts()}] DEBUG`, ...a),
};

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
