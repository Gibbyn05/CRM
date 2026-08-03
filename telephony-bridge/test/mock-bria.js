#!/usr/bin/env node

// ============================================================================
//  «Mock-Bria» – later som Bria Desktop API, så du kan teste HELE bro-flyten
//  på din egen Mac uten en ekte Bria-installasjon.
//
//  Snakker samme protokoll som ekte Bria: svarer på «GET /status» og pusher
//  «statusChange»-hendelser, og kjører et simulert samtaleforløp
//  (Ringing → Connected → avsluttet).
//
//  Bruk (to terminaler):
//    1) node test/mock-bria.js
//    2) sett BRIA_WS_URL=ws://127.0.0.1:9099/counterpath/socketapi/v1/ i .env,
//       så: npm start
//
//  Da skal broen logge started/answered/ended og sende samtalen til CRM-en.
// ============================================================================

const { WebSocketServer } = require("ws");

const PORT = Number(process.env.MOCK_PORT) || 9099;
const wss = new WebSocketServer({ port: PORT });

function frame(startLine, body) {
  const len = Buffer.byteLength(body, "utf8");
  return (
    `${startLine}\r\n` +
    `Content-Type: application/xml\r\n` +
    `Content-Length: ${len}\r\n\r\n` +
    body
  );
}

function statusBody(call) {
  const inner = call
    ? `<call><id>${call.id}</id><participants><participant>` +
      `<number>${call.number}</number><state>${call.state}</state>` +
      `</participant></participants></call>`
    : "";
  return `<status>${inner}</status>`;
}

wss.on("connection", (ws) => {
  console.log("✓ Broen koblet til mock-Bria. Kjører simulert samtale …");
  let call = null; // { id, number, state }

  // Svar på broens statusforespørsler med gjeldende tilstand.
  ws.on("message", (data) => {
    if (/^GET\s+\/status/i.test(data.toString())) {
      ws.send(frame("HTTP/1.1 200 OK", statusBody(call)));
    }
  });

  const id = "mock-" + Date.now();
  const number = "+4790012345";
  const notify = () => {
    if (ws.readyState === ws.OPEN) {
      ws.send(frame("POST /statusChange", '<event type="statusChange"></event>'));
    }
  };

  const timers = [
    setTimeout(() => { call = { id, number, state: "Ringing" }; console.log("  → Ringing (startet)"); notify(); }, 1500),
    setTimeout(() => { call = { id, number, state: "Connected" }; console.log("  → Connected (svart)"); notify(); }, 4000),
    setTimeout(() => { call = null; console.log("  → Avsluttet"); notify(); }, 8000),
  ];

  ws.on("close", () => timers.forEach(clearTimeout));
});

console.log(
  `Mock-Bria kjører på ws://127.0.0.1:${PORT}/counterpath/socketapi/v1/\n` +
    `Sett BRIA_WS_URL til den adressen i .env og start broen. Ctrl+C for å stoppe.`,
);
