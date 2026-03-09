import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { indexCodexHistory } from "../../src/server/history/history-index";

describe("history index", () => {
  const tempRoot = path.join(
    "C:\\Users\\kiwun\\Documents\\localapp",
    `.tmp-history-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );

  afterEach(async () => {
    await import("node:fs/promises").then(({ rm }) => rm(tempRoot, { recursive: true, force: true }));
  });

  it("reads codex session jsonl files into selectable history entries", async () => {
    const dir = path.join(tempRoot, "2026", "03", "09");
    const file = path.join(dir, "rollout-2026-03-09T16-00-00-thread-123.jsonl");
    await mkdir(dir, { recursive: true });
    await writeFile(
      file,
      [
        JSON.stringify({
          timestamp: "2026-03-09T13:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "thread-123",
            timestamp: "2026-03-09T13:00:00.000Z",
            cwd: "C:\\Users\\kiwun\\Documents\\project-a",
            source: "vscode",
            model_provider: "openai",
          },
        }),
        JSON.stringify({
          timestamp: "2026-03-09T13:00:01.000Z",
          type: "event_msg",
          payload: {
            type: "user_message",
            message: "почини backend",
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const entries = await indexCodexHistory({
      sessionsRoot: tempRoot,
      workspacePath: "C:\\Users\\kiwun\\Documents\\project-a",
      limit: 10,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      threadId: "thread-123",
      cwd: "C:\\Users\\kiwun\\Documents\\project-a",
      preview: "почини backend",
      source: "vscode",
    });
  });
});
