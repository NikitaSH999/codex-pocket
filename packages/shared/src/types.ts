export type SessionStatus = "idle" | "running" | "waiting" | "completed" | "failed" | "archived";

export type GitSummary = {
  branch: string | null;
  repoRoot: string | null;
  dirty: boolean;
};

export type SessionSummary = {
  id: string;
  name: string | null;
  preview: string;
  cwd: string;
  updatedAt: number;
  createdAt: number;
  status: SessionStatus;
  agentRole: string | null;
  unread: boolean;
  git: GitSummary;
};

export type TimelineEntryType =
  | "userMessage"
  | "agentMessage"
  | "plan"
  | "reasoning"
  | "commandExecution"
  | "fileChange"
  | "mcpToolCall"
  | "dynamicToolCall"
  | "collabAgentToolCall"
  | "webSearch"
  | "imageView"
  | "imageGeneration"
  | "reviewMode"
  | "contextCompaction";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  phase: "commentary" | "final" | "unknown";
};

export type TimelineEntry = {
  id: string;
  type: TimelineEntryType;
  title: string;
  body: string;
  status?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export type SessionDetail = SessionSummary & {
  messages: ChatMessage[];
  timeline: TimelineEntry[];
};

export type ApprovalKind = "command" | "fileChange" | "permissions" | "userInput";

export type ApprovalRequest = {
  id: string;
  requestId: string;
  threadId: string;
  turnId: string;
  itemId: string;
  kind: ApprovalKind;
  title: string;
  body: string;
  options: string[];
  status: "pending" | "resolved";
  createdAt: number;
  payload: Record<string, unknown>;
};

export type WorkspaceSummary = {
  cwd: string;
  label: string;
  lastSessionId: string | null;
  updatedAt: number;
  git: GitSummary;
};

export type EventEnvelope =
  | {
      id: string;
      type: "notification";
      method: string;
      threadId?: string;
      timestamp: number;
      payload: Record<string, unknown>;
    }
  | {
      id: string;
      type: "approval";
      threadId: string;
      timestamp: number;
      payload: ApprovalRequest;
    }
  | {
      id: string;
      type: "sessionChanged";
      threadId: string;
      timestamp: number;
      payload: SessionSummary;
    };

export type PairingResponse = {
  token: string;
  expiresAt: number;
  deviceName: string;
};

export type BridgeConfigResponse = {
  appName: string;
  pairingHint: string;
  paired: boolean;
  trustedDeviceName: string | null;
};
