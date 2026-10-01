import { describe, expect, it } from "vitest";
import { briaCallActionRequest, briaDialRequest, briaStatusRequest } from "./bria-browser";

describe("Bria Desktop API commands", () => {
  it("normalizes a Norwegian number and keeps the Bria window hidden", () => {
    const message = briaDialRequest("912 34 567", 4);
    expect(message).toContain("GET /call\r\n");
    expect(message).toContain("<number>+4791234567</number>");
    expect(message).toContain("<suppressMainWindow>true</suppressMainWindow>");
    expect(message).toContain("Transaction-ID: 4");
    expect(briaDialRequest("ikke et nummer", 5)).toBeNull();
  });

  it("targets one Bria call ID rather than ending every call", () => {
    const message = briaCallActionRequest("endCall", "call-123", 6);
    expect(message).toContain("GET /endCall\r\n");
    expect(message).toContain("<callId>call-123</callId>");
    expect(briaCallActionRequest("endCall", "", 6)).toBeNull();
  });

  it("escapes the call ID and creates answer and status requests", () => {
    expect(briaCallActionRequest("answer", "id<&", 7)).toContain("<callId>id&lt;&amp;</callId>");
    expect(briaCallActionRequest("answer", "id", 7)).toContain("<withVideo>false</withVideo>");
    expect(briaStatusRequest("call", 8)).toContain("<status><type>call</type></status>");
  });

  it("sets the actual UTF-8 body length", () => {
    const message = briaStatusRequest("authentication", 9);
    const body = message.split("\r\n\r\n")[1];
    expect(message).toContain(`Content-Length: ${new TextEncoder().encode(body).length}`);
  });
});
