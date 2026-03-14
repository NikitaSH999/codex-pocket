import { describe, expect, it } from "vitest";
import { mapServerRequestToApproval, mapThreadToDetail, mapThreadToSummary } from "./mapper.js";

describe("mapper", () => {
  const thread = {
    id: "thread_1",
    name: "Fix bug",
    preview: "Please investigate",
    cwd: "C:/repo",
    createdAt: 100,
    updatedAt: 200,
    status: "running",
    gitInfo: { branch: "main", repositoryRoot: "C:/repo" },
    agentRole: null,
    turns: [
      {
        id: "turn_1",
        status: "completed",
        items: [
          {
            type: "userMessage",
            id: "msg_user",
            content: [{ type: "text", text: "hello" }]
          },
          {
            type: "agentMessage",
            id: "msg_agent",
            text: "world",
            phase: "final"
          }
        ]
      }
    ]
  };

  it("maps thread summaries", () => {
    const summary = mapThreadToSummary(thread, new Set(["thread_1"]));
    expect(summary.id).toBe("thread_1");
    expect(summary.unread).toBe(true);
    expect(summary.git.branch).toBe("main");
  });

  it("maps thread details into messages and timeline entries", () => {
    const detail = mapThreadToDetail(thread, new Set());
    expect(detail.messages).toHaveLength(2);
    expect(detail.timeline).toHaveLength(2);
  });

  it("maps approvals from app-server requests", () => {
    const approval = mapServerRequestToApproval("42", {
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread_1",
        turnId: "turn_1",
        itemId: "item_1",
        command: "git push",
        cwd: "C:/repo"
      }
    });

    expect(approval.kind).toBe("command");
    expect(approval.options).toContain("accept");
  });
});
