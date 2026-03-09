import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import net from "node:net";

import WebSocket from "ws";

import type { CollaborationModeKind } from "../../shared/contracts";

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

export interface CodexNotification {
  method: string;
  params: any;
}

export interface BridgeStartOptions {
  cwd: string;
  threadId?: string;
}

export interface BridgeThreadInfo {
  threadId: string;
  model: string;
  cwd: string;
}

export interface CodexBridgeLike {
  readonly threadId: string;
  readonly cwd: string;
  readonly model: string;
  onNotification(listener: (notification: CodexNotification) => void): () => void;
  onStderr(listener: (message: string) => void): () => void;
  sendUserMessage(text: string, mode: CollaborationModeKind): Promise<void>;
  dispose(): Promise<void>;
}

export type CodexBridgeFactory = (options: BridgeStartOptions) => Promise<CodexBridgeLike>;

export class CodexBridge implements CodexBridgeLike {
  private readonly pending = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: unknown) => void;
    }
  >();
  private readonly listeners = new Set<(notification: CodexNotification) => void>();
  private readonly stderrListeners = new Set<(message: string) => void>();
  private child!: ChildProcessWithoutNullStreams;
  private socket!: WebSocket;
  private requestCounter = 0;
  private threadInfo!: BridgeThreadInfo;

  static async create(options: BridgeStartOptions): Promise<CodexBridge> {
    const bridge = new CodexBridge();
    await bridge.start(options);
    return bridge;
  }

  get threadId(): string {
    return this.threadInfo.threadId;
  }

  get cwd(): string {
    return this.threadInfo.cwd;
  }

  get model(): string {
    return this.threadInfo.model;
  }

  onNotification(listener: (notification: CodexNotification) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStderr(listener: (message: string) => void): () => void {
    this.stderrListeners.add(listener);
    return () => this.stderrListeners.delete(listener);
  }

  async sendUserMessage(text: string, mode: CollaborationModeKind): Promise<void> {
    await this.request("turn/start", {
      threadId: this.threadInfo.threadId,
      input: [
        {
          type: "text",
          text,
          text_elements: [],
        },
      ],
      collaborationMode:
        mode === "plan"
          ? {
              mode: "plan",
              settings: {
                model: this.threadInfo.model,
                reasoning_effort: null,
                developer_instructions: null,
              },
            }
          : {
              mode: "default",
              settings: {
                model: this.threadInfo.model,
                reasoning_effort: null,
                developer_instructions: null,
              },
            },
    });
  }

  async dispose(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
    }

    if (!this.child.killed) {
      this.child.kill();
    }
  }

  private async start(options: BridgeStartOptions): Promise<void> {
    const port = await findFreePort();
    this.child = spawn("cmd", ["/c", "codex", "app-server", "--listen", `ws://127.0.0.1:${port}`], {
      cwd: options.cwd,
      windowsHide: true,
    });

    this.child.stderr.on("data", (chunk) => {
      const message = chunk.toString("utf8");
      for (const listener of this.stderrListeners) {
        listener(message);
      }
    });

    await waitForServer(port, this.child);

    this.socket = new WebSocket(`ws://127.0.0.1:${port}`, {
      perMessageDeflate: false,
    });
    await once(this.socket, "open");

    this.socket.on("message", (data) => {
      const message = JSON.parse(data.toString("utf8")) as JsonRpcMessage;
      if (message.id && this.pending.has(message.id)) {
        const deferred = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          deferred?.reject(message.error);
        } else {
          deferred?.resolve(message.result);
        }
        return;
      }

      if (message.method) {
        for (const listener of this.listeners) {
          listener({
            method: message.method,
            params: message.params,
          });
        }
      }
    });

    this.socket.on("close", () => {
      for (const deferred of this.pending.values()) {
        deferred.reject(new Error("Codex bridge closed"));
      }
      this.pending.clear();
    });

    await this.request("initialize", {
      clientInfo: {
        name: "codex-mobile-webui",
        title: "Codex Mobile WebUI",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
        optOutNotificationMethods: null,
      },
    });
    this.notify("initialized");

    const response = options.threadId
      ? await this.request("thread/resume", {
          threadId: options.threadId,
          cwd: options.cwd,
          approvalPolicy: "never",
          sandbox: "danger-full-access",
          persistExtendedHistory: true,
        })
      : await this.request("thread/start", {
          cwd: options.cwd,
          approvalPolicy: "never",
          sandbox: "danger-full-access",
          experimentalRawEvents: false,
          persistExtendedHistory: true,
        });

    this.threadInfo = {
      threadId: response.thread.id,
      model: response.model ?? "gpt-5.4",
      cwd: response.cwd ?? options.cwd,
    };
  }

  private request(method: string, params: unknown): Promise<any> {
    const id = `rpc-${++this.requestCounter}`;
    const payload: JsonRpcMessage = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(payload));
    });
  }

  private notify(method: string, params?: unknown): void {
    this.socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
      }),
    );
  }
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address?.port) {
          resolve(address.port);
          return;
        }

        reject(new Error("Unable to allocate port"));
      });
    });
    server.on("error", reject);
  });
}

async function waitForServer(port: number, child: ChildProcessWithoutNullStreams): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10000) {
    if (child.exitCode !== null) {
      throw new Error(`codex app-server exited with code ${child.exitCode}`);
    }

    const reachable = await canConnect(port);
    if (reachable) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error("Timed out waiting for codex app-server");
}

async function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("error", () => resolve(false));
  });
}
