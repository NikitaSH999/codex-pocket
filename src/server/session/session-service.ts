import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { nanoid } from "nanoid";

import type {
  CodexHistoryEntry,
  CollaborationModeKind,
  ComposerAttachment,
  McpServerStatus,
  ModelOption,
  PersistedState,
  ResolveApprovalRequest,
  SessionApproval,
  SessionEvent,
  SessionPreferences,
  SessionRecord,
  SessionStreamEvent,
  SpeedPreset,
} from "../../shared/contracts";
import { JsonStore } from "../state/json-store";
import { importHistorySession, indexCodexHistory } from "../history/history-index";
import { createSessionRecord, reduceSessionEvent } from "../state/session-reducer";
import {
  CodexBridge,
  type BridgeStartOptions,
  type BridgeUserInput,
  type CodexBridgeFactory,
  type CodexBridgeLike,
  type CodexNotification,
  type CodexServerRequest,
} from "../codex/codex-bridge";

type StreamListener = (event: SessionStreamEvent) => void;

interface SessionServiceOptions {
  store: JsonStore;
  codexSessionsDir: string;
  codexFactory?: CodexBridgeFactory;
}

export class SessionService {
  private readonly activeBridges = new Map<string, CodexBridgeLike>();
  private readonly listeners = new Map<string, Set<StreamListener>>();
  private readonly updateQueues = new Map<string, Promise<void>>();

  constructor(private readonly options: SessionServiceOptions) {}

  async listSessions(): Promise<SessionRecord[]> {
    const state = await this.options.store.read();
    return Object.values(state.sessions).sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    const state = await this.options.store.read();
    return state.sessions[sessionId] ?? null;
  }

  async createSession(
    mode?: CollaborationModeKind,
    title?: string,
    workspacePath?: string,
    preferences?: Partial<SessionPreferences>,
  ): Promise<SessionRecord> {
    const state = await this.options.store.read();
    const resolvedPreferences = resolvePreferences(state, preferences);
    const bridge = await this.createBridge({
      cwd: workspacePath ?? state.settings.workspacePath,
      model: resolvedPreferences.model,
      approvalPolicy: resolvedPreferences.approvalPolicy,
    });

    const session = createSessionRecord({
      id: bridge.threadId,
      threadId: bridge.threadId,
      cwd: bridge.cwd,
      mode: mode ?? state.settings.defaultMode,
      preferences: resolvedPreferences,
      title,
    });

    await this.options.store.write((current) => ({
      ...current,
      sessions: {
        ...current.sessions,
        [session.id]: session,
      },
    }));

    this.attachBridge(session.id, bridge);
    return session;
  }

  async listHistory(workspacePath?: string): Promise<CodexHistoryEntry[]> {
    return indexCodexHistory({
      sessionsRoot: this.options.codexSessionsDir,
      workspacePath,
      limit: 80,
    });
  }

  async importHistorySession(
    threadId: string,
    historyPath: string,
    mode?: CollaborationModeKind,
  ): Promise<SessionRecord> {
    const existing = await this.getSession(threadId);
    if (existing) {
      return existing;
    }

    const imported = await importHistorySession(historyPath, mode);
    if (!imported) {
      throw new Error("History thread not found");
    }

    const state = await this.options.store.read();
    const withPreferences: SessionRecord = {
      ...imported,
      preferences: resolvePreferences(state),
      approvals: imported.approvals ?? [],
    };

    await this.options.store.write((current) => ({
      ...current,
      sessions: {
        ...current.sessions,
        [withPreferences.id]: withPreferences,
      },
    }));

    return withPreferences;
  }

  async setMode(sessionId: string, mode: CollaborationModeKind): Promise<SessionRecord> {
    const state = await this.options.store.write((current) => {
      const existing = current.sessions[sessionId];
      if (!existing) {
        throw new Error("Session not found");
      }

      return {
        ...current,
        sessions: {
          ...current.sessions,
          [sessionId]: {
            ...existing,
            mode,
            updatedAt: Date.now(),
          },
        },
      };
    });

    return state.sessions[sessionId]!;
  }

  async setPreferences(
    sessionId: string,
    preferences: Partial<SessionPreferences>,
  ): Promise<SessionRecord> {
    const state = await this.options.store.write((current) => {
      const existing = current.sessions[sessionId];
      if (!existing) {
        throw new Error("Session not found");
      }

      return {
        ...current,
        sessions: {
          ...current.sessions,
          [sessionId]: {
            ...existing,
            preferences: {
              ...existing.preferences,
              ...preferences,
            },
            updatedAt: Date.now(),
          },
        },
      };
    });

    return state.sessions[sessionId]!;
  }

  async forkSession(sessionId: string): Promise<SessionRecord> {
    const session = await this.getRequiredSession(sessionId);
    const bridge = await this.ensureBridge(session);
    const fork = await bridge.forkThread({
      cwd: session.cwd,
      model: session.preferences.model,
      approvalPolicy: session.preferences.approvalPolicy,
    });
    const now = Date.now();
    const forkedSession: SessionRecord = {
      ...session,
      id: fork.threadId,
      threadId: fork.threadId,
      title: `${session.title} (fork)`,
      cwd: fork.cwd,
      createdAt: now,
      updatedAt: now,
      status: "idle",
      messages: session.messages.map((message) => ({ ...message })),
      activity: [],
      commands: [],
      tools: [],
      planBlocks: session.planBlocks.map((block) => ({ ...block })),
      approvals: [],
    };

    await this.options.store.write((current) => ({
      ...current,
      sessions: {
        ...current.sessions,
        [forkedSession.id]: forkedSession,
      },
    }));

    const forkBridge = await this.createBridge({
      cwd: fork.cwd,
      threadId: fork.threadId,
      model: session.preferences.model,
      approvalPolicy: session.preferences.approvalPolicy,
    });
    this.attachBridge(forkedSession.id, forkBridge);

    return forkedSession;
  }

  async listModels(sessionId: string): Promise<ModelOption[]> {
    const session = await this.getRequiredSession(sessionId);
    const bridge = await this.ensureBridge(session);
    return bridge.listModels();
  }

  async listMcpServerStatus(sessionId: string): Promise<McpServerStatus[]> {
    const session = await this.getRequiredSession(sessionId);
    const bridge = await this.ensureBridge(session);
    return bridge.listMcpServerStatus();
  }

  async sendMessage(
    sessionId: string,
    text: string,
    attachments: ComposerAttachment[] = [],
  ): Promise<void> {
    const session = await this.getRequiredSession(sessionId);
    const bridge = await this.ensureBridge(session);
    const inputs = await buildUserInputs(this.options.store.dataDir, sessionId, text, attachments);
    await bridge.sendUserMessage(inputs, session.mode, session.preferences);
  }

  async resolveApproval(
    sessionId: string,
    requestId: string,
    payload: ResolveApprovalRequest,
  ): Promise<SessionRecord> {
    const session = await this.getRequiredSession(sessionId);
    const approval = session.approvals.find(
      (item) => item.requestId === requestId && item.status === "pending",
    );
    if (!approval) {
      throw new Error("Approval request not found");
    }

    const bridge = await this.ensureBridge(session);
    bridge.respondToServerRequest(
      requestId,
      approval.kind === "command"
        ? mapCommandApprovalDecision(approval, payload)
        : {
            decision: mapFileChangeDecision(payload.decision),
          },
    );

    await this.enqueueSessionEvent(sessionId, {
      type: "approval_resolved",
      requestId,
      decision: payload.decision,
    });

    return (await this.getSession(sessionId))!;
  }

  async subscribe(sessionId: string, listener: StreamListener): Promise<() => void> {
    const listeners = this.listeners.get(sessionId) ?? new Set<StreamListener>();
    listeners.add(listener);
    this.listeners.set(sessionId, listeners);

    const session = await this.getRequiredSession(sessionId);
    await this.ensureBridge(session);

    return () => {
      const current = this.listeners.get(sessionId);
      current?.delete(listener);
      if (current && current.size === 0) {
        this.listeners.delete(sessionId);
      }
    };
  }

  private async ensureBridge(session: SessionRecord): Promise<CodexBridgeLike> {
    const existing = this.activeBridges.get(session.id);
    if (existing) {
      return existing;
    }

    const bridge = await this.createBridge({
      cwd: session.cwd,
      threadId: session.threadId,
      model: session.preferences.model,
      approvalPolicy: session.preferences.approvalPolicy,
    });
    this.attachBridge(session.id, bridge);
    return bridge;
  }

  private createBridge(options: BridgeStartOptions): Promise<CodexBridgeLike> {
    return this.options.codexFactory?.(options) ?? CodexBridge.create(options);
  }

  private attachBridge(sessionId: string, bridge: CodexBridgeLike): void {
    this.activeBridges.set(sessionId, bridge);

    bridge.onNotification((notification) => {
      const events = normalizeNotification(notification);
      for (const event of events) {
        void this.enqueueSessionEvent(sessionId, event);
      }
    });

    bridge.onServerRequest((request) => {
      const events = normalizeServerRequest(request);
      for (const event of events) {
        void this.enqueueSessionEvent(sessionId, event);
      }
    });

    bridge.onStderr((message) => {
      void this.enqueueSessionEvent(sessionId, {
        type: "status_update",
        turnId: "system",
        status: "running",
        detail: message.trim(),
      });
    });
  }

  private async enqueueSessionEvent(sessionId: string, event: SessionEvent): Promise<void> {
    const queue = this.updateQueues.get(sessionId) ?? Promise.resolve();
    const next = queue
      .then(async () => {
        const state = await this.options.store.write((current) =>
          updateSession(current, sessionId, event),
        );
        const snapshot = state.sessions[sessionId];
        if (!snapshot) {
          return;
        }

        const payload: SessionStreamEvent = {
          sessionId,
          event,
          snapshot,
        };

        for (const listener of this.listeners.get(sessionId) ?? []) {
          listener(payload);
        }
      })
      .catch((error) => {
        console.error(error);
      });

    this.updateQueues.set(sessionId, next);
    await next;
  }

  private async getRequiredSession(sessionId: string): Promise<SessionRecord> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    return session;
  }
}

function updateSession(
  state: PersistedState,
  sessionId: string,
  event: SessionEvent,
): PersistedState {
  const current = state.sessions[sessionId];
  if (!current) {
    return state;
  }

  return {
    ...state,
    sessions: {
      ...state.sessions,
      [sessionId]: reduceSessionEvent(current, event),
    },
  };
}

function normalizeNotification(notification: CodexNotification): SessionEvent[] {
  const params = notification.params ?? {};

  switch (notification.method) {
    case "turn/started":
      return [
        {
          type: "session_state_changed",
          turnId: params.turnId ?? params.turn?.id ?? "turn",
          status: "running",
        },
      ];
    case "turn/completed": {
      const turnStatus = params.turn?.status;
      return [
        {
          type: "session_state_changed",
          turnId: params.turn?.id ?? "turn",
          status:
            turnStatus === "failed"
              ? "error"
              : turnStatus === "interrupted"
                ? "waiting"
                : "done",
          detail: turnStatus,
        },
      ];
    }
    case "item/started":
    case "item/completed":
      return normalizeItem(notification.method, params);
    case "item/agentMessage/delta":
      return [
        {
          type: "chat_message",
          role: "assistant",
          itemId: params.itemId,
          turnId: params.turnId,
          text: "",
          delta: params.delta ?? "",
          state: "streaming",
        },
      ];
    case "item/commandExecution/outputDelta":
      return [
        {
          type: "command_output",
          itemId: params.itemId,
          turnId: params.turnId,
          delta: params.delta ?? "",
        },
      ];
    case "turn/plan/updated":
      return [
        {
          type: "plan_block_detected",
          itemId: `plan-${params.turnId ?? nanoid()}`,
          turnId: params.turnId ?? "turn",
          text: stringifyPlan(params.explanation, params.plan),
        },
      ];
    default:
      return [];
  }
}

function normalizeItem(method: string, params: any): SessionEvent[] {
  const item = params.item;
  if (!item) {
    return [];
  }

  const state = method === "item/completed" ? "final" : "streaming";

  switch (item.type) {
    case "userMessage":
      return [
        {
          type: "chat_message",
          role: "user",
          itemId: item.id,
          turnId: params.turnId,
          text: item.content?.map((part: any) => part.text ?? "").join("") ?? "",
          state: "final",
        },
      ];
    case "agentMessage":
      return [
        {
          type: "chat_message",
          role: "assistant",
          itemId: item.id,
          turnId: params.turnId,
          text: item.text ?? "",
          state,
        },
      ];
    case "plan":
      return [
        {
          type: "plan_block_detected",
          itemId: item.id,
          turnId: params.turnId,
          text: item.text ?? "",
        },
      ];
    case "commandExecution":
      if (method === "item/started") {
        return [
          {
            type: "command_started",
            itemId: item.id,
            turnId: params.turnId,
            command: item.command,
            cwd: item.cwd,
          },
        ];
      }

      return [
        {
          type: "command_finished",
          itemId: item.id,
          turnId: params.turnId,
          exitCode: item.exitCode ?? null,
          durationMs: item.durationMs ?? null,
        },
      ];
    case "mcpToolCall":
      if (method === "item/started") {
        return [
          {
            type: "tool_started",
            itemId: item.id,
            turnId: params.turnId,
            label: `${item.server}.${item.tool}`,
          },
        ];
      }

      return [
        {
          type: "tool_finished",
          itemId: item.id,
          turnId: params.turnId,
          label: `${item.server}.${item.tool}`,
          ok: item.status === "completed",
          detail: item.error?.message ?? undefined,
        },
      ];
    default:
      return [];
  }
}

function normalizeServerRequest(request: CodexServerRequest): SessionEvent[] {
  const params = request.params ?? {};

  switch (request.method) {
    case "item/commandExecution/requestApproval":
      return [
        {
          type: "approval_requested",
          approval: {
            id: params.approvalId ?? request.id,
            requestId: request.id,
            kind: "command",
            itemId: params.itemId,
            turnId: params.turnId,
            status: "pending",
            command: params.command ?? undefined,
            cwd: params.cwd ?? undefined,
            reason: params.reason ?? undefined,
            proposedExecpolicyAmendment: params.proposedExecpolicyAmendment ?? undefined,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      ];
    case "item/fileChange/requestApproval":
      return [
        {
          type: "approval_requested",
          approval: {
            id: request.id,
            requestId: request.id,
            kind: "fileChange",
            itemId: params.itemId,
            turnId: params.turnId,
            status: "pending",
            reason: params.reason ?? undefined,
            grantRoot: params.grantRoot ?? undefined,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      ];
    default:
      return [];
  }
}

function stringifyPlan(
  explanation: string | null | undefined,
  plan: Array<{ step: string; status: string }> = [],
): string {
  const lines = plan.map((item) => `- [${item.status}] ${item.step}`);
  return [explanation ?? "", ...lines].filter(Boolean).join("\n");
}

function resolvePreferences(
  state: PersistedState,
  overrides: Partial<SessionPreferences> = {},
): SessionPreferences {
  return {
    model: overrides.model ?? state.settings.defaultModel ?? null,
    reasoningEffort:
      overrides.reasoningEffort ?? state.settings.defaultReasoningEffort ?? null,
    approvalPolicy:
      overrides.approvalPolicy ?? state.settings.defaultApprovalPolicy ?? "never",
  };
}

async function buildUserInputs(
  dataDir: string,
  sessionId: string,
  text: string,
  attachments: ComposerAttachment[],
): Promise<BridgeUserInput[]> {
  const trimmedText = text.trim();
  const uploadsDir = path.join(dataDir, "uploads", sessionId);
  const manifestLines: string[] = [];
  const extraTextBlocks: string[] = [];
  const inputs: BridgeUserInput[] = [];

  if (attachments.length) {
    await mkdir(uploadsDir, { recursive: true });
  }

  for (const attachment of attachments) {
    const safeName = sanitizeFilename(attachment.name);
    const targetPath = path.join(uploadsDir, `${Date.now()}-${safeName}`);
    const buffer = Buffer.from(attachment.contentBase64, "base64");
    await writeFile(targetPath, buffer);

    if (isImageAttachment(attachment.mimeType, safeName)) {
      inputs.push({
        type: "localImage",
        path: targetPath,
      });
      manifestLines.push(`- image: ${safeName}`);
      continue;
    }

    if (isTextAttachment(attachment.mimeType, safeName)) {
      const fileText = buffer.toString("utf8").slice(0, 48_000);
      manifestLines.push(`- file: ${safeName}`);
      extraTextBlocks.push(
        [
          `Attached file: ${safeName}`,
          `Path: ${targetPath}`,
          "```",
          fileText,
          "```",
        ].join("\n"),
      );
      continue;
    }

    manifestLines.push(`- binary: ${safeName} (${formatBytes(attachment.size)})`);
    extraTextBlocks.push(`Attached binary file: ${safeName}\nPath: ${targetPath}`);
  }

  const combinedText = [
    trimmedText,
    manifestLines.length ? ["Attached context:", ...manifestLines].join("\n") : "",
    ...extraTextBlocks,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (combinedText) {
    inputs.unshift({
      type: "text",
      text: combinedText,
    });
  }

  return inputs;
}

function sanitizeFilename(value: string): string {
  const trimmed = value.trim() || "attachment";
  return trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-");
}

function isImageAttachment(mimeType: string, name: string): boolean {
  return mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
}

function isTextAttachment(mimeType: string, name: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    /(json|xml|javascript|typescript|markdown)/i.test(mimeType) ||
    /\.(txt|md|json|ts|tsx|js|jsx|css|html|yml|yaml|toml|py|rs|go|java|kt|sql|sh)$/i.test(
      name,
    )
  );
}

function mapCommandApprovalDecision(
  approval: SessionApproval,
  payload: ResolveApprovalRequest,
): { decision: unknown } {
  if (
    payload.decision === "accept" &&
    payload.applyExecPolicyAmendment &&
    approval.proposedExecpolicyAmendment?.length
  ) {
    return {
      decision: {
        acceptWithExecpolicyAmendment: {
          execpolicy_amendment: approval.proposedExecpolicyAmendment,
        },
      },
    };
  }

  return {
    decision:
      payload.decision === "accept"
        ? "accept"
        : payload.decision === "acceptForSession"
          ? "acceptForSession"
          : payload.decision === "decline"
            ? "decline"
            : "cancel",
  };
}

function mapFileChangeDecision(decision: ResolveApprovalRequest["decision"]): string {
  switch (decision) {
    case "accept":
      return "accept";
    case "acceptForSession":
      return "acceptForSession";
    case "decline":
      return "decline";
    case "cancel":
      return "cancel";
  }
}

export function speedPresetForPreferences(
  preferences: SessionPreferences,
): SpeedPreset {
  switch (preferences.reasoningEffort) {
    case "high":
    case "xhigh":
      return "deep";
    case "minimal":
    case "low":
    case "none":
      return "fast";
    default:
      return "balanced";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 102.4) / 10} KB`;
  }
  return `${Math.round(bytes / 104857.6) / 10} MB`;
}
