export type CollaborationModeKind = "default" | "plan";
export type SessionStatus = "idle" | "running" | "waiting" | "done" | "error";
export type MessageRole = "user" | "assistant";
export type MessageState = "streaming" | "final";
export type ApprovalPolicy = "untrusted" | "on-failure" | "on-request" | "never";
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type SpeedPreset = "fast" | "balanced" | "deep";

export interface SessionPreferences {
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
  approvalPolicy: ApprovalPolicy;
}

export interface ModelOption {
  id: string;
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  defaultReasoningEffort: ReasoningEffort;
  supportedReasoningEfforts: ReasoningEffort[];
  inputModalities: Array<"text" | "image">;
}

export interface ModelListResponse {
  data: ModelOption[];
}

export interface McpServerStatus {
  name: string;
  authStatus: string;
  toolCount: number;
  resourceCount: number;
  resourceTemplateCount: number;
}

export interface McpStatusResponse {
  data: McpServerStatus[];
  refreshedAt: number;
}

export interface ComposerAttachment {
  name: string;
  mimeType: string;
  size: number;
  contentBase64: string;
}

export interface SessionApproval {
  id: string;
  requestId: string;
  kind: "command" | "fileChange";
  itemId: string;
  turnId: string;
  status: "pending" | "resolved";
  command?: string;
  cwd?: string;
  reason?: string;
  grantRoot?: string;
  proposedExecpolicyAmendment?: string[];
  createdAt: number;
  updatedAt: number;
  decision?: "accept" | "acceptForSession" | "decline" | "cancel";
}

export interface ListenUrl {
  label: string;
  url: string;
}

export interface SettingsResponse {
  hasAuth: boolean;
  authenticated?: boolean;
  workspacePath: string;
  defaultMode: CollaborationModeKind;
  defaultModel: string | null;
  defaultReasoningEffort: ReasoningEffort | null;
  defaultApprovalPolicy: ApprovalPolicy;
  listenUrls: ListenUrl[];
  networkAccessMode?: "private" | "public";
}

export interface WorkspaceBrowserEntry {
  name: string;
  path: string;
  kind: "directory";
}

export interface WorkspaceBrowserResponse {
  currentPath: string;
  parentPath: string | null;
  roots: string[];
  entries: WorkspaceBrowserEntry[];
}

export interface CodexHistoryEntry {
  threadId: string;
  path: string;
  cwd: string;
  preview: string;
  source: string;
  createdAt: number;
  updatedAt: number;
}

export interface CodexHistoryListResponse {
  entries: CodexHistoryEntry[];
}

export interface AuthResponse {
  hasAuth: boolean;
  authenticated: boolean;
}

export interface SessionMessage {
  itemId: string;
  turnId: string;
  role: MessageRole;
  text: string;
  state: MessageState;
  createdAt: number;
}

export interface ActivityStatusItem {
  id: string;
  type: "status_update";
  turnId: string;
  status: SessionStatus;
  createdAt: number;
  detail?: string;
}

export interface ActivityCommandItem {
  id: string;
  type: "command";
  itemId: string;
  turnId: string;
  command: string;
  cwd: string;
  status: "running" | "completed" | "failed";
  createdAt: number;
  detail?: string;
}

export interface ActivityToolItem {
  id: string;
  type: "tool";
  itemId: string;
  turnId: string;
  label: string;
  status: "running" | "completed" | "failed";
  createdAt: number;
  detail?: string;
}

export interface ActivityPlanItem {
  id: string;
  type: "plan";
  itemId: string;
  turnId: string;
  createdAt: number;
  detail: string;
}

export type ActivityItem =
  | ActivityStatusItem
  | ActivityCommandItem
  | ActivityToolItem
  | ActivityPlanItem;

export interface CommandRecord {
  itemId: string;
  turnId: string;
  command: string;
  cwd: string;
  status: "running" | "completed" | "failed";
  aggregatedOutput: string;
  exitCode: number | null;
  durationMs: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ToolRecord {
  itemId: string;
  turnId: string;
  label: string;
  status: "running" | "completed" | "failed";
  ok: boolean | null;
  createdAt: number;
  updatedAt: number;
}

export interface PlanBlock {
  itemId: string;
  turnId: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionRecord {
  id: string;
  threadId: string;
  title: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  mode: CollaborationModeKind;
  preferences: SessionPreferences;
  status: SessionStatus;
  messages: SessionMessage[];
  activity: ActivityItem[];
  commands: CommandRecord[];
  tools: ToolRecord[];
  planBlocks: PlanBlock[];
  approvals: SessionApproval[];
}

export interface SessionListResponse {
  sessions: SessionRecord[];
}

export interface SessionResponse {
  session: SessionRecord;
}

export interface CreateSessionRequest {
  title?: string;
  mode?: CollaborationModeKind;
  workspacePath?: string;
  preferences?: Partial<SessionPreferences>;
}

export interface SendMessageRequest {
  text: string;
  attachments?: ComposerAttachment[];
}

export interface UpdateModeRequest {
  mode: CollaborationModeKind;
}

export interface UpdateSettingsRequest {
  workspacePath?: string;
  defaultMode?: CollaborationModeKind;
  defaultModel?: string | null;
  defaultReasoningEffort?: ReasoningEffort | null;
  defaultApprovalPolicy?: ApprovalPolicy;
}

export interface UpdateSessionPreferencesRequest {
  model?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  approvalPolicy?: ApprovalPolicy;
}

export interface ResolveApprovalRequest {
  decision: "accept" | "acceptForSession" | "decline" | "cancel";
  applyExecPolicyAmendment?: boolean;
}

export interface ImportHistoryRequest {
  threadId: string;
  path: string;
  mode?: CollaborationModeKind;
}

export type SessionEvent =
  | {
      type: "chat_message";
      role: MessageRole;
      itemId: string;
      turnId: string;
      text: string;
      delta?: string;
      state: MessageState;
    }
  | {
      type: "status_update";
      turnId: string;
      status: SessionStatus;
      detail?: string;
    }
  | {
      type: "command_started";
      itemId: string;
      turnId: string;
      command: string;
      cwd: string;
    }
  | {
      type: "command_output";
      itemId: string;
      turnId: string;
      delta: string;
    }
  | {
      type: "command_finished";
      itemId: string;
      turnId: string;
      exitCode: number | null;
      durationMs: number | null;
    }
  | {
      type: "tool_started";
      itemId: string;
      turnId: string;
      label: string;
    }
  | {
      type: "tool_finished";
      itemId: string;
      turnId: string;
      label: string;
      ok: boolean;
      detail?: string;
    }
  | {
      type: "plan_block_detected";
      itemId: string;
      turnId: string;
      text: string;
    }
  | {
      type: "approval_requested";
      approval: SessionApproval;
    }
  | {
      type: "approval_resolved";
      requestId: string;
      decision: "accept" | "acceptForSession" | "decline" | "cancel";
    }
  | {
      type: "session_state_changed";
      turnId: string;
      status: SessionStatus;
      detail?: string;
    };

export interface SessionStreamEvent {
  sessionId: string;
  event: SessionEvent;
  snapshot: SessionRecord;
}

export type SessionStreamMessage =
  | {
      kind: "snapshot";
      session: SessionRecord;
    }
  | {
      kind: "event";
      payload: SessionStreamEvent;
    };

export interface PersistedState {
  auth: {
    pinHash: string | null;
    cookieSecret: string;
  };
  settings: {
    workspacePath: string;
    defaultMode: CollaborationModeKind;
    defaultModel: string | null;
    defaultReasoningEffort: ReasoningEffort | null;
    defaultApprovalPolicy: ApprovalPolicy;
  };
  sessions: Record<string, SessionRecord>;
}
