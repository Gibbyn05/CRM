#!/usr/bin/env node
require("dotenv").config();

// ============================================================================
//  «Liksom-Bria» – simulerer en hel samtale mot CRM-en UTEN Bria.
//
//  Sender de samme hendelsene broen ville sendt (call_started / answered /
//  ended) til /api/telephony/webhook, og laster ev. opp en lydfil til
//  /api/telephony/recording. Brukes til å verifisere at CRM-siden (samtalelogg,
//  «Sist ringt», status, transkript/sammendrag) fungerer før levering.
//
//  Bruk:
//    node test/simulate-call.js
//    node test/simulate-call.js --customer <kunde-uuid> --phone +4790012345
//    node test/simulate-call.js --customer <uuid> --audio /sti/til/opptak.mp3
//
//  Krever i .env: CRM_BASE_URL, WEBHOOK_SECRET, AGENT_ID.
// ============================================================================

const fs = require("node:fs");
const path = require("node:path");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const baseUrl = (process.env.CRM_BASE_URL || "").replace(/\/+$/, "");
const secret = process.env.WEBHOOK_SECRET;
const agentId = process.env.AGENT_ID || null;
const customerId = arg("customer");
const phone = arg("phone", "+4790012345");
const audioPath = arg("audio");

if (!baseUrl || !secret) {
  console.error("Mangler CRM_BASE_URL og/eller WEBHOOK_SECRET i .env.");
  process.exit(1);
}

const externalCallId = `sim-${Date.now()}`;

async function sendEvent(eventType) {
  const res = await fetch(`${baseUrl}/api/telephony/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret },
    body: JSON.stringify({
      event_type: eventType,
      external_call_id: externalCallId,
      agent_id: agentId ?? undefined,
      customer_id: customerId ?? undefined,
      phone_number: phone,
      direction: "outbound",
      occurred_at: new Date().toISOString(),
    }),
  });
  const txt = await res.text();
  console.log(`→ ${eventType}: HTTP ${res.status} ${txt.slice(0, 160)}`);
  if (!res.ok) throw new Error(`${eventType} feilet`);
}

async function sendRecording(file) {
  const buf = fs.readFileSync(file);
  const form = new FormData();
  form.append("external_call_id", externalCallId);
  if (agentId) form.append("agent_id", agentId);
  form.append(
    "audio",
    new Blob([buf], { type: "application/octet-stream" }),
    path.basename(file),
  );
  const res = await fetch(`${baseUrl}/api/telephony/recording`, {
    method: "POST",
    headers: { "X-Webhook-Secret": secret },
    body: form,
  });
  const txt = await res.text();
  console.log(`→ opptak (${path.basename(file)}): HTTP ${res.status} ${txt.slice(0, 200)}`);
}

(async () => {
  console.log(`Simulerer samtale ${externalCallId} mot ${baseUrl}`);
  console.log(`  agent_id=${agentId ?? "(ingen)"} customer_id=${customerId ?? "(ingen)"} phone=${phone}\n`);

  await sendEvent("call_started");
  await sleep(1200);
  await sendEvent("call_answered");
  await sleep(2500);
  await sendEvent("call_ended");

  if (audioPath) {
    if (!fs.existsSync(audioPath)) {
      console.error(`\nFant ikke lydfila: ${audioPath}`);
    } else {
      console.log("\nLaster opp opptak for transkribering …");
      await sendRecording(audioPath);
    }
  }

  console.log("\n✅ Ferdig. Sjekk i CRM-en:");
  console.log("   • Dashbord → «Sist ringt» skal vise samtalen.");
  if (customerId) {
    console.log(`   • Kundekortet (/customers/${customerId}) → Aktivitet:`);
    console.log("     samtale + (hvis opptak lastet opp) transkript/sammendrag.");
  } else {
    console.log("   • Tips: kjør med --customer <uuid> for å knytte den til et kundekort.");
  }
})().catch((e) => {
  console.error("Feil:", e.message);
  process.exit(1);
});
