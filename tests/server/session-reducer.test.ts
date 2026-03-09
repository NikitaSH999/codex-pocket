import { describe, expect, it } from "vitest";

import {
  createSessionRecord,
  reduceSessionEvent,
} from "../../src/server/state/session-reducer";

describe("session reducer", () => {
  it("aggregates assistant deltas, commands, tools, and plan state into a durable session view", () => {
    let session = createSessionRecord({
      id: "session-1",
      threadId: "thread-1",
      cwd: "C:\\Users\\kiwun\\Documents\\localapp",
      mode: "plan",
    });

    session = reduceSessionEvent(session, {
      type: "chat_message",
      role: "user",
      itemId: "user-1",
      text: "Сделай план",
      turnId: "turn-1",
      state: "final",
    });
    session = reduceSessionEvent(session, {
      type: "chat_message",
      role: "assistant",
      itemId: "assistant-1",
      text: "",
      delta: "<proposed_plan>",
      turnId: "turn-1",
      state: "streaming",
    });
    session = reduceSessionEvent(session, {
      type: "chat_message",
      role: "assistant",
      itemId: "assistant-1",
      text: "",
      delta: "hello",
      turnId: "turn-1",
      state: "streaming",
    });
    session = reduceSessionEvent(session, {
      type: "plan_block_detected",
      itemId: "assistant-1",
      turnId: "turn-1",
      text: "<proposed_plan>\nhello\n</proposed_plan>",
    });
    session = reduceSessionEvent(session, {
      type: "command_started",
      itemId: "cmd-1",
      turnId: "turn-1",
      command: "npm test",
      cwd: "C:\\Users\\kiwun\\Documents\\localapp",
    });
    session = reduceSessionEvent(session, {
      type: "command_output",
      itemId: "cmd-1",
      turnId: "turn-1",
      delta: "PASS tests\\session.test.ts",
    });
    session = reduceSessionEvent(session, {
      type: "command_finished",
      itemId: "cmd-1",
      turnId: "turn-1",
      exitCode: 0,
      durationMs: 1200,
    });
    session = reduceSessionEvent(session, {
      type: "tool_started",
      itemId: "tool-1",
      turnId: "turn-1",
      label: "playwright.navigate",
    });
    session = reduceSessionEvent(session, {
      type: "tool_finished",
      itemId: "tool-1",
      turnId: "turn-1",
      label: "playwright.navigate",
      ok: true,
    });
    session = reduceSessionEvent(session, {
      type: "session_state_changed",
      status: "done",
      turnId: "turn-1",
    });

    expect(session.messages).toHaveLength(2);
    expect(session.messages[1]?.text).toBe("<proposed_plan>hello");
    expect(session.planBlocks[0]?.text).toContain("</proposed_plan>");
    expect(session.commands[0]?.aggregatedOutput).toContain("PASS");
    expect(session.commands[0]?.status).toBe("completed");
    expect(session.tools[0]?.status).toBe("completed");
    expect(session.status).toBe("done");
    expect(session.updatedAt).toBeGreaterThanOrEqual(session.createdAt);
  });
});
