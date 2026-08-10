import { describe, expect, it } from "vitest";
import { toLiveRows } from "./live";
import type { AgentState } from "./types";

describe("toLiveRows", () => {
  it("preserves profile photos and applies the current status", () => {
    const states: AgentState[] = [
      {
        agent_id: "manager-1",
        status: "in_call",
        current_call_id: null,
        last_call_started_at: "2026-08-11T08:00:00.000Z",
        last_call_ended_at: null,
        status_changed_at: "2026-08-11T08:00:00.000Z",
        updated_at: "2026-08-11T08:00:00.000Z",
      },
    ];

    expect(
      toLiveRows(
        [
          {
            id: "manager-1",
            full_name: "Test Leder",
            avatar_url: "https://example.com/avatar.png",
          },
        ],
        states,
      ),
    ).toEqual([
      expect.objectContaining({
        agent_id: "manager-1",
        avatar_url: "https://example.com/avatar.png",
        status: "in_call",
      }),
    ]);
  });
});
