import { nanoid } from "nanoid";

import type {
  CodexHistoryEntry,
  CollaborationModeKind,
  PersistedState,
  SessionEvent,
  SessionRecord,
  SessionStreamEvent,
} from "../../shared/contracts";
import { JsonStore } from "../state/json-store";
import { importHistorySession, indexCodexHistory } from "../history/history-index";
import { createSessionRecord, reduceSessionEvent } from "../state/session-reducer";
import {
  CodexBridge,
  type BridgeStartOptions,
  type CodexBridgeFactory,
  type CodexBridgeLike,
  type CodexNotification,
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
  ): Promise<SessionRecord> {
    const state = await this.options.store.read();
    const bridge = await this.createBridge({
      cwd: workspacePath ?? state.settings.workspacePath,
    });

    const session = createSessionRecord({
      id: bridge.threadId,
      threadId: bridge.threadId,
      cwd: bridge.cwd,
      mode: mode ?? state.settings.defaultMode,
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

    await this.options.store.write((current) => ({
      ...current,
      sessions: {
        ...current.sessions,
        [imported.id]: imported,
      },
    }));

    return imported;
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

  async sendMessage(sessionId: string, text: string): Promise<void> {
    const session = await this.getRequiredSession(sessionId);
    const bridge = await this.ensureBridge(session);
    await bridge.sendUserMessage(text, session.mode);
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
        this.enqueueSessionEvent(sessionId, event);
      }
    });

    bridge.onStderr((message) => {
      this.enqueueSessionEvent(sessionId, {
        type: "status_update",
        turnId: "system",
        status: "running",
        detail: message.trim(),
      });
    });
  }

  private enqueueSessionEvent(sessionId: string, event: SessionEvent): void {
    const queue = this.updateQueues.get(sessionId) ?? Promise.resolve();
    const next = queue
      .then(async () => {
        const state = await this.options.store.write((current) => updateSession(current, sessionId, event));
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

function stringifyPlan(
  explanation: string | null | undefined,
  plan: Array<{ step: string; status: string }> = [],
): string {
  const lines = plan.map((item) => `- [${item.status}] ${item.step}`);
  return [explanation ?? "", ...lines].filter(Boolean).join("\n");
}
