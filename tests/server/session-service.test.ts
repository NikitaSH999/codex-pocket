import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SessionService } from "../../src/server/session/session-service";
import { JsonStore } from "../../src/server/state/json-store";

describe("SessionService history sync", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("pulls external codex history into local sessions", async () => {
    const root = path.join(
      "C:\\Users\\kiwun\\Documents\\localapp",
      `.tmp-test-session-sync-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const dataDir = path.join(root, ".local");
    const workspacePath = path.join(root, "workspace");
    const codexSessionsDir = path.join(root, ".codex", "sessions", "2026", "03", "10");
    const historyPath = path.join(codexSessionsDir, "rollout-sync-thread.jsonl");

    tempDirs.push(root);
    await mkdir(workspacePath, { recursive: true });
    await mkdir(codexSessionsDir, { recursive: true });

    await writeFile(
      historyPath,
      [
        JSON.stringify({
          timestamp: "2026-03-10T09:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "sync-thread",
            cwd: workspacePath,
            source: "vscode",
          },
        }),
        JSON.stringify({
          timestamp: "2026-03-10T09:00:01.000Z",
          type: "event_msg",
          payload: {
            type: "user_message",
            message: "hello from ide",
          },
        }),
        JSON.stringify({
          timestamp: "2026-03-10T09:00:02.000Z",
          type: "event_msg",
          payload: {
            type: "agent_message",
            message: "hello from codex",
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const store = new JsonStore({
      dataDir,
      workspacePath,
    });
    const service = new SessionService({
      store,
      codexSessionsDir: path.join(root, ".codex", "sessions"),
    });

    const sessions = await service.listSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      id: "sync-thread",
      threadId: "sync-thread",
      cwd: workspacePath,
      status: "done",
    });
    expect(sessions[0].messages.map((message) => message.text)).toEqual([
      "hello from ide",
      "hello from codex",
    ]);
  });
});
