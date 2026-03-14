import { EventEmitter } from "node:events";
import WebSocket from "ws";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
};

type JsonRpcNotification = {
  jsonrpc?: "2.0";
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcServerRequest = JsonRpcNotification & { id: string | number };

export class CodexRpcClient extends EventEmitter {
  private socket: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<
    string | number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();

  constructor(private readonly url: string) {
    super();
  }

  async connect() {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;

      socket.on("open", () => resolve());
      socket.on("message", (message) => this.handleMessage(String(message)));
      socket.on("close", () => {
        this.socket = null;
        this.emit("disconnected");
      });
      socket.on("error", (error) => reject(error));
    });

    await this.request("initialize", {
      clientInfo: { name: "codex-phone-bridge", version: "0.1.0" },
      capabilities: null
    });
  }

  private handleMessage(message: string) {
    const parsed = JSON.parse(message) as JsonRpcNotification | JsonRpcResponse | JsonRpcServerRequest;

    if ("id" in parsed && ("result" in parsed || "error" in parsed) && !("method" in parsed)) {
      const pending = this.pending.get(parsed.id);
      if (!pending) {
        return;
      }

      this.pending.delete(parsed.id);
      if (parsed.error) {
        pending.reject(new Error(parsed.error.message));
      } else {
        pending.resolve(parsed.result);
      }
      return;
    }

    if ("id" in parsed && "method" in parsed) {
      this.emit("server-request", parsed);
      return;
    }

    this.emit("notification", parsed);
  }

  request<T>(method: string, params?: unknown): Promise<T> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("codex app-server is not connected"));
    }

    const id = this.nextId++;
    const payload: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    this.socket.send(JSON.stringify(payload));

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject
      });
    });
  }

  respond(id: string | number, result: unknown) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("codex app-server is not connected");
    }

    const payload: JsonRpcResponse = { jsonrpc: "2.0", id, result };
    this.socket.send(JSON.stringify(payload));
  }

  close() {
    this.socket?.close();
    this.socket = null;
  }
}
