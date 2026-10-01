import { normalizePhoneNumber } from "@/lib/format";

export const BRIA_DESKTOP_API_URL = "wss://cpclientapi.softphone.com:9002/counterpath/socketapi/v1/";

export type BriaCall = {
  id: string;
  number: string;
  state: "ringing" | "connecting" | "connected";
};

const xml = (value: string) => value.replace(/[<>&"']/g, (character) => ({
  "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
})[character] || character);

export function briaRequest(path: "status" | "call" | "answer" | "endCall", body: string, transactionId: number) {
  const content = `<?xml version="1.0" encoding="utf-8" ?>\r\n${body}`;
  return `GET /${path}\r\nUser-Agent: Media Norge CRM\r\nTransaction-ID: ${transactionId}\r\nContent-Type: application/xml\r\nContent-Length: ${new TextEncoder().encode(content).length}\r\n\r\n${content}`;
}

export function briaStatusRequest(type: "call" | "authentication", transactionId: number) {
  return briaRequest("status", `<status><type>${type}</type></status>`, transactionId);
}

export function briaDialRequest(phone: string, transactionId: number) {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return null;
  // suppressMainWindow keeps Bria's own window out of the user's workflow.
  return briaRequest("call", `<dial type="audio"><number>${normalized}</number><displayName></displayName><suppressMainWindow>true</suppressMainWindow></dial>`, transactionId);
}

export function briaCallActionRequest(action: "answer" | "endCall", callId: string, transactionId: number) {
  if (!callId || callId.length > 200 || /[\x00-\x1f]/.test(callId)) return null;
  const tag = action === "answer" ? "answerCall" : "endCall";
  const video = action === "answer" ? "<withVideo>false</withVideo>" : "";
  return briaRequest(action, `<${tag}><callId>${xml(callId)}</callId>${video}</${tag}>`, transactionId);
}

export function parseBriaFrame(frame: string):
  | { kind: "error"; message: string }
  | { kind: "status-change"; type: string }
  | { kind: "authentication"; authenticated: boolean }
  | { kind: "calls"; calls: BriaCall[] }
  | { kind: "other" } {
  const firstLine = frame.split(/\r?\n/, 1)[0];
  if (/^HTTP\/1\.1 [45]\d\d/.test(firstLine)) return { kind: "error", message: `Bria svarte ${firstLine}. Kontroller Bria > Application > Security.` };
  const start = frame.indexOf("<");
  if (start < 0) return { kind: "other" };
  const document = new DOMParser().parseFromString(frame.slice(start), "application/xml");
  if (document.querySelector("parsererror")) return { kind: "error", message: "Bria svarte med ugyldig samtalestatus." };
  if (/^POST \/statusChange/.test(firstLine)) {
    return { kind: "status-change", type: document.documentElement.getAttribute("type") || "" };
  }
  if (!/^HTTP\/1\.1 200\b/.test(firstLine)) return { kind: "other" };
  const status = document.querySelector("status");
  if (status?.getAttribute("type") === "authentication") {
    return { kind: "authentication", authenticated: status.querySelector("authenticated")?.textContent === "true" };
  }
  if (status?.getAttribute("type") !== "call") return { kind: "other" };
  const calls: BriaCall[] = [];
  for (const call of Array.from(status.children).filter((child) => child.tagName === "call")) {
    const id = call.querySelector("id")?.textContent?.trim();
    const participant = call.querySelector("participants > participant");
    const state = participant?.querySelector("state")?.textContent?.trim().toLowerCase();
    if (!id || !participant || !state) return { kind: "error", message: "Bria sendte en ufullstendig samtalestatus." };
    if (state === "ringing" || state === "connecting" || state === "connected") {
      calls.push({ id, number: participant.querySelector("number")?.textContent?.trim() || "Ukjent nummer", state });
    } else if (!['ended', 'failed'].includes(state)) {
      return { kind: "error", message: "Bria sendte en ukjent samtalestatus." };
    }
  }
  return { kind: "calls", calls };
}
