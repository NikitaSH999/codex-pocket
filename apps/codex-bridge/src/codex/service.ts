import crypto from "node:crypto";
import type {
  ApprovalRequest,
  EventEnvelope,
  SessionDetail,
  SessionSummary,
  WorkspaceSummary
} from "@codex-phone/shared";
import {
  mapServerRequestToApproval,
  mapThreadToDetail,
  mapThreadToSummary,
  mapThreadsToWorkspaces
} from "./mapper.js";
import { CodexRpcClient } from "./client.js";
import { CodexAppServerProcess } from "./process.js";
import { StateStore } from "../persistence.js";

type ThreadListResponse = { data: Array<any>; nextCursor: string | null };
type ThreadReadResponse = { thread: any };
type ThreadStartResponse = { thread: any };

type PendingRequest = {
  requestId: string;
  request: { method: string; params: Record<string, unknown> };
  approval: ApprovalRequest;
};

export class CodexBridgeService {
  private readonly unreadThreadIds = new Set<string>();
  private readonly pendingRequests = new Map<string, PendingRequest>();

  constructor(
    private readonly processManager: CodexAppServerProcess | null,
    private readonly rpcClient: CodexRpcClient,
    private readonly stateStore: StateStore
  ) {
    this.rpcClient.on("notification", (event) =>
      this.handleNotification(event as { method: string; params?: Record<string, unknown> })
    );
    this.rpcClient.on("server-request", (request) =>
      this.handleServerRequest(request as { id: string; method: string; params?: Record<string, unknown> })
    );
  }

  async start() {
    this.processManager?.start();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        await this.rpcClient.connect();
        return;
      } catch (error) {
        if (attempt === 9) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
  }

  private emitEvent(event: EventEnvelope) {
    this.rpcClient.emit("bridge-event", event);
  }

  onBridgeEvent(listener: (event: EventEnvelope) => void) {
    this.rpcClient.on("bridge-event", listener);
  }

  offBridgeEvent(listener: (event: EventEnvelope) => void) {
    this.rpcClient.off("bridge-event", listener);
  }

  private handleNotification(notification: { method: string; params?: Record<string, unknown> }) {
    const threadId =
      typeof notification.params?.threadId === "string"
        ? notification.params.threadId
        : typeof notification.params?.thread === "object" &&
            notification.params.thread &&
            "id" in notification.params.thread
          ? String((notification.params.thread as { id: string }).id)
          : undefined;

    if (threadId) {
      this.unreadThreadIds.add(threadId);
      this.stateStore.update((current) => ({ ...current, lastActiveThreadId: threadId }));
    }

    this.emitEvent({
      id: crypto.randomUUID(),
      type: "notification",
      method: notification.method,
      threadId,
      timestamp: Date.now(),
      payload: notification.params ?? {}
    });
  }

  private handleServerRequest(request: { id: string; method: string; params?: Record<string, unknown> }) {
    const approval = mapServerRequestToApproval(request.id, {
      method: request.method,
      params: request.params ?? {}
    });

    this.pendingRequests.set(approval.id, {
      requestId: request.id,
      request: { method: request.method, params: request.params ?? {} },
      approval
    });

    this.emitEvent({
      id: crypto.randomUUID(),
      type: "approval",
      threadId: approval.threadId,
      timestamp: approval.createdAt,
      payload: approval
    });
  }

  async listSessions(): Promise<SessionSummary[]> {
    const threads = await this.listAllThreads();
    return threads
      .map((thread) => mapThreadToSummary(thread, this.unreadThreadIds))
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async getSession(threadId: string): Promise<SessionDetail> {
    const response = await this.rpcClient.request<ThreadReadResponse>("thread/read", {
      threadId,
      includeTurns: true
    });
    this.unreadThreadIds.delete(threadId);
    return mapThreadToDetail(response.thread, this.unreadThreadIds);
  }

  async startSession(cwd: string) {
    const response = await this.rpcClient.request<ThreadStartResponse>("thread/start", {
      cwd,
      experimentalRawEvents: false,
      persistExtendedHistory: true
    });
    this.stateStore.update((current) => ({ ...current, lastActiveThreadId: response.thread.id }));
    return mapThreadToDetail(response.thread, this.unreadThreadIds);
  }

  async resumeSession(threadId: string) {
    const response = await this.rpcClient.request<ThreadStartResponse>("thread/resume", {
      threadId,
      persistExtendedHistory: true
    });
    return mapThreadToDetail(response.thread, this.unreadThreadIds);
  }

  async forkSession(threadId: string) {
    const response = await this.rpcClient.request<ThreadStartResponse>("thread/fork", {
      threadId,
      persistExtendedHistory: true
    });
    return mapThreadToDetail(response.thread, this.unreadThreadIds);
  }

  async archiveSession(threadId: string) {
    await this.rpcClient.request("thread/archive", { threadId });
  }

  async sendMessage(threadId: string, text: string) {
    await this.rpcClient.request("turn/start", {
      threadId,
      input: [{ type: "text", text, text_elements: [] }]
    });
    this.stateStore.update((current) => ({ ...current, lastActiveThreadId: threadId }));
  }

  listApprovals() {
    return [...this.pendingRequests.values()].map((entry) => entry.approval);
  }

  async respondToApproval(
    approvalId: string,
    payload: { decision?: string; answers?: Record<string, { answers: string[] }> }
  ) {
    const pending = this.pendingRequests.get(approvalId);
    if (!pending) {
      throw new Error("Unknown approval request");
    }

    switch (pending.request.method) {
      case "item/tool/requestUserInput":
        this.rpcClient.respond(pending.requestId, { answers: payload.answers ?? {} });
        break;
      case "item/permissions/requestApproval":
        this.rpcClient.respond(pending.requestId, { permissions: payload.decision ?? "decline" });
        break;
      default:
        this.rpcClient.respond(pending.requestId, { decision: payload.decision ?? "decline" });
    }

    this.pendingRequests.delete(approvalId);
  }

  async listWorkspaces(): Promise<WorkspaceSummary[]> {
    const threads = await this.listAllThreads();
    return mapThreadsToWorkspaces(threads, this.unreadThreadIds);
  }

  getLastActiveThreadId() {
    return this.stateStore.read().lastActiveThreadId;
  }

  private async listAllThreads() {
    const threads: Array<any> = [];
    let nextCursor: string | null = null;

    do {
      const response: ThreadListResponse = await this.rpcClient.request<ThreadListResponse>("thread/list", {
        limit: 100,
        cursor: nextCursor,
        archived: false
      });
      threads.push(...response.data);
      nextCursor = response.nextCursor;
    } while (nextCursor);

    return threads;
  }
}
