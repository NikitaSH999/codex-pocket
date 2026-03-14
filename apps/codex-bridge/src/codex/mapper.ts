import crypto from "node:crypto";
import type {
  ApprovalRequest,
  ChatMessage,
  GitSummary,
  SessionDetail,
  SessionStatus,
  SessionSummary,
  TimelineEntry,
  WorkspaceSummary
} from "@codex-phone/shared";

type CodexThread = {
  id: string;
  name: string | null;
  preview: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  status: string;
  gitInfo: {
    branch?: string | null;
    repositoryRoot?: string | null;
  } | null;
  agentRole: string | null;
  turns: Array<{
    id: string;
    status: string;
    items: Array<Record<string, any>>;
  }>;
};

const normalizeStatus = (value: string): SessionStatus => {
  switch (value) {
    case "running":
      return "running";
    case "waiting":
      return "waiting";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "archived":
      return "archived";
    default:
      return "idle";
  }
};

const gitSummaryFromThread = (thread: CodexThread): GitSummary => ({
  branch: thread.gitInfo?.branch ?? null,
  repoRoot: thread.gitInfo?.repositoryRoot ?? null,
  dirty: false
});

const timelineFromItem = (item: Record<string, any>): TimelineEntry => {
  const type = String(item.type ?? "contextCompaction") as TimelineEntry["type"];
  switch (type) {
    case "userMessage": {
      const content = Array.isArray(item.content) ? item.content : [];
      const text = content
        .map((entry) => (typeof entry === "object" && entry && "text" in entry ? String(entry.text) : ""))
        .filter(Boolean)
        .join("\n");
      return { id: String(item.id), type, title: "You", body: text || "User input", status: null };
    }
    case "agentMessage":
      return {
        id: String(item.id),
        type,
        title: "Codex",
        body: String(item.text ?? ""),
        status: item.phase ? String(item.phase) : null
      };
    case "commandExecution":
      return {
        id: String(item.id),
        type,
        title: String(item.command ?? "Command"),
        body: String(item.aggregatedOutput ?? ""),
        status: item.status ? String(item.status) : null,
        metadata: {
          cwd: String(item.cwd ?? ""),
          exitCode: typeof item.exitCode === "number" ? item.exitCode : -1
        }
      };
    case "fileChange":
      return {
        id: String(item.id),
        type,
        title: "File changes",
        body: JSON.stringify(item.changes ?? [], null, 2),
        status: item.status ? String(item.status) : null
      };
    case "plan":
      return { id: String(item.id), type, title: "Plan", body: String(item.text ?? "") };
    case "reasoning":
      return {
        id: String(item.id),
        type,
        title: "Reasoning",
        body: Array.isArray(item.summary) ? item.summary.map(String).join("\n") : ""
      };
    default:
      return {
        id: String(item.id ?? crypto.randomUUID()),
        type,
        title: type,
        body: JSON.stringify(item, null, 2)
      };
  }
};

export const mapThreadToSummary = (
  thread: CodexThread,
  unreadThreadIds: Set<string>
): SessionSummary => ({
  id: thread.id,
  name: thread.name,
  preview: thread.preview,
  cwd: thread.cwd,
  updatedAt: thread.updatedAt * 1000,
  createdAt: thread.createdAt * 1000,
  status: normalizeStatus(thread.status),
  agentRole: thread.agentRole,
  unread: unreadThreadIds.has(thread.id),
  git: gitSummaryFromThread(thread)
});

export const mapThreadToDetail = (
  thread: CodexThread,
  unreadThreadIds: Set<string>
): SessionDetail => {
  const summary = mapThreadToSummary(thread, unreadThreadIds);
  const messages: ChatMessage[] = [];
  const timeline: TimelineEntry[] = [];

  for (const turn of thread.turns) {
    for (const item of turn.items) {
      timeline.push(timelineFromItem(item));

      if (item.type === "userMessage") {
        const content = Array.isArray(item.content) ? item.content : [];
        const text = content
          .map((entry) => (typeof entry === "object" && entry && "text" in entry ? String(entry.text) : ""))
          .filter(Boolean)
          .join("\n");
        messages.push({ id: String(item.id), role: "user", text, phase: "unknown" });
      }

      if (item.type === "agentMessage") {
        messages.push({
          id: String(item.id),
          role: "assistant",
          text: String(item.text ?? ""),
          phase: item.phase === "commentary" || item.phase === "final" ? item.phase : "unknown"
        });
      }
    }
  }

  return {
    ...summary,
    messages,
    timeline
  };
};

export const mapThreadsToWorkspaces = (
  threads: CodexThread[],
  unreadThreadIds: Set<string>
): WorkspaceSummary[] => {
  const byCwd = new Map<string, WorkspaceSummary>();

  for (const thread of threads) {
    const existing = byCwd.get(thread.cwd);
    const candidate: WorkspaceSummary = {
      cwd: thread.cwd,
      label: thread.cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? thread.cwd,
      lastSessionId: thread.id,
      updatedAt: thread.updatedAt * 1000,
      git: gitSummaryFromThread(thread)
    };

    if (!existing || existing.updatedAt < candidate.updatedAt || unreadThreadIds.has(thread.id)) {
      byCwd.set(thread.cwd, candidate);
    }
  }

  return [...byCwd.values()].sort((left, right) => right.updatedAt - left.updatedAt);
};

export const mapServerRequestToApproval = (
  requestId: string,
  request: { method: string; params: Record<string, unknown> }
): ApprovalRequest => {
  const base = {
    id: `${request.params.threadId ?? "global"}:${requestId}`,
    requestId,
    threadId: String(request.params.threadId ?? "global"),
    turnId: String(request.params.turnId ?? "unknown"),
    itemId: String(request.params.itemId ?? "unknown"),
    status: "pending" as const,
    createdAt: Date.now(),
    payload: request.params
  };

  switch (request.method) {
    case "item/commandExecution/requestApproval":
      return {
        ...base,
        kind: "command",
        title: "Command approval",
        body: `${request.params.command ?? "Command"}\n${request.params.cwd ?? ""}`.trim(),
        options: ["accept", "acceptForSession", "decline", "cancel"]
      };
    case "item/fileChange/requestApproval":
      return {
        ...base,
        kind: "fileChange",
        title: "File change approval",
        body: String(request.params.reason ?? "Codex wants to apply file changes."),
        options: ["accept", "acceptForSession", "decline", "cancel"]
      };
    case "item/permissions/requestApproval":
      return {
        ...base,
        kind: "permissions",
        title: "Permissions approval",
        body: "Codex requested broader permissions for this step.",
        options: ["workspace-write", "danger-full-access", "decline"]
      };
    case "item/tool/requestUserInput":
      return {
        ...base,
        kind: "userInput",
        title: "Need your input",
        body: "Codex is waiting for structured input from the phone.",
        options: ["respond"]
      };
    default:
      return {
        ...base,
        kind: "command",
        title: request.method,
        body: JSON.stringify(request.params, null, 2),
        options: ["accept", "decline"]
      };
  }
};
