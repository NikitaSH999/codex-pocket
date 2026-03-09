import path from "node:path";
import { access } from "node:fs/promises";
import os from "node:os";

import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import { z } from "zod";

import type {
  CreateSessionRequest,
  ResolveApprovalRequest,
  SendMessageRequest,
  UpdateSessionPreferencesRequest,
  UpdateModeRequest,
  UpdateSettingsRequest,
  ImportHistoryRequest,
} from "../shared/contracts";
import { AuthManager } from "./auth/auth-manager";
import { browseWorkspace } from "./workspaces/workspace-browser";
import { collectListenUrls } from "./network/listen-urls";
import {
  collectAllowedCidrsFromSystem,
  ipAllowedForMode,
  normalizeIp,
  type NetworkAccessMode,
} from "./security/network-guard";
import { SessionService } from "./session/session-service";
import { JsonStore } from "./state/json-store";
import type { CodexBridgeFactory } from "./codex/codex-bridge";

interface BuildAppOptions {
  dataDir: string;
  workspacePath: string;
  port?: number;
  enforceNetworkGuard?: boolean;
  networkAccessMode?: NetworkAccessMode;
  codexFactory?: CodexBridgeFactory;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  const port = options.port ?? 4318;
  const store = new JsonStore({
    dataDir: options.dataDir,
    workspacePath: options.workspacePath,
  });
  const auth = new AuthManager(store);
  const codexSessionsDir = path.join(os.homedir(), ".codex", "sessions");
  const sessions = new SessionService({
    store,
    codexSessionsDir,
    codexFactory: options.codexFactory,
  });
  const allowedCidrs = collectAllowedCidrsFromSystem();
  const networkAccessMode = options.networkAccessMode ?? "private";

  await app.register(cookie);
  await app.register(websocket);

  app.decorate("services", {
    auth,
    sessions,
    store,
  });

  app.addHook("preHandler", async (request, reply) => {
    if (options.enforceNetworkGuard === false) {
      return;
    }

    if (!request.url.startsWith("/api") && !request.url.startsWith("/ws")) {
      return;
    }

    const ip = normalizeIp(request.ip);
    if (!ip || !ipAllowedForMode(ip, allowedCidrs, networkAccessMode)) {
      reply.code(403).send({ error: "Forbidden" });
    }
  });

  app.post("/api/auth/setup", async (request, reply) => {
    const payload = z.object({ pin: z.string().min(4) }).parse(request.body);

    if (await auth.hasSetup()) {
      reply.code(409);
      return { error: "PIN already configured" };
    }

    await auth.setup(payload.pin);
    const token = auth.issueSession();
    setSessionCookie(reply, token);
    return { hasAuth: true, authenticated: true };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const payload = z.object({ pin: z.string().min(1) }).parse(request.body);

    const ok = await auth.verify(payload.pin);
    if (!ok) {
      reply.code(401);
      return { error: "Invalid PIN" };
    }

    const token = auth.issueSession();
    setSessionCookie(reply, token);
    return { hasAuth: true, authenticated: true };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    auth.revokeSession(request.cookies.codex_mobile_session);
    reply.clearCookie("codex_mobile_session");
    return { hasAuth: await auth.hasSetup(), authenticated: false };
  });

  app.get("/api/settings", async (request) => {
    const state = await store.read();
    return {
      hasAuth: await auth.hasSetup(),
      authenticated: auth.isSessionValid(request.cookies.codex_mobile_session),
      workspacePath: state.settings.workspacePath,
      defaultMode: state.settings.defaultMode,
      defaultModel: state.settings.defaultModel,
      defaultReasoningEffort: state.settings.defaultReasoningEffort,
      defaultApprovalPolicy: state.settings.defaultApprovalPolicy,
      listenUrls: collectListenUrls(port),
      networkAccessMode,
    };
  });

  app.put("/api/settings", async (request, reply) => {
    requireAuth(request, reply, auth);
    const payload = z
      .object({
        workspacePath: z.string().min(1).optional(),
        defaultMode: z.enum(["default", "plan"]).optional(),
        defaultModel: z.string().nullable().optional(),
        defaultReasoningEffort: z
          .enum(["none", "minimal", "low", "medium", "high", "xhigh"])
          .nullable()
          .optional(),
        defaultApprovalPolicy: z
          .enum(["untrusted", "on-failure", "on-request", "never"])
          .optional(),
      })
      .parse(request.body as UpdateSettingsRequest);

    const state = await store.write((current) => ({
      ...current,
      settings: {
        workspacePath: payload.workspacePath ?? current.settings.workspacePath,
        defaultMode: payload.defaultMode ?? current.settings.defaultMode,
        defaultModel:
          payload.defaultModel === undefined
            ? current.settings.defaultModel
            : payload.defaultModel,
        defaultReasoningEffort:
          payload.defaultReasoningEffort === undefined
            ? current.settings.defaultReasoningEffort
            : payload.defaultReasoningEffort,
        defaultApprovalPolicy:
          payload.defaultApprovalPolicy ?? current.settings.defaultApprovalPolicy,
      },
    }));

    return {
      hasAuth: await auth.hasSetup(),
      authenticated: true,
      workspacePath: state.settings.workspacePath,
      defaultMode: state.settings.defaultMode,
      defaultModel: state.settings.defaultModel,
      defaultReasoningEffort: state.settings.defaultReasoningEffort,
      defaultApprovalPolicy: state.settings.defaultApprovalPolicy,
      listenUrls: collectListenUrls(port),
      networkAccessMode,
    };
  });

  app.get("/api/sessions", async (request, reply) => {
    requireAuth(request, reply, auth);
    return { sessions: await sessions.listSessions() };
  });

  app.get("/api/history", async (request, reply) => {
    requireAuth(request, reply, auth);
    const workspacePath = (request.query as { workspacePath?: string }).workspacePath;
    return { entries: await sessions.listHistory(workspacePath) };
  });

  app.post("/api/sessions", async (request, reply) => {
    requireAuth(request, reply, auth);
    const payload = z
      .object({
        title: z.string().optional(),
        mode: z.enum(["default", "plan"]).optional(),
        workspacePath: z.string().min(1).optional(),
        preferences: z
          .object({
            model: z.string().nullable().optional(),
            reasoningEffort: z
              .enum(["none", "minimal", "low", "medium", "high", "xhigh"])
              .nullable()
              .optional(),
            approvalPolicy: z
              .enum(["untrusted", "on-failure", "on-request", "never"])
              .optional(),
          })
          .optional(),
      })
      .parse(request.body as CreateSessionRequest);
    const session = await sessions.createSession(
      payload.mode,
      payload.title,
      payload.workspacePath,
      payload.preferences,
    );
    reply.code(201);
    return { session };
  });

  app.get("/api/sessions/:id", async (request, reply) => {
    requireAuth(request, reply, auth);
    const session = await sessions.getSession((request.params as { id: string }).id);
    if (!session) {
      reply.code(404);
      return { error: "Session not found" };
    }

    return { session };
  });

  app.post("/api/sessions/:id/fork", async (request, reply) => {
    requireAuth(request, reply, auth);
    const session = await sessions.forkSession((request.params as { id: string }).id);
    reply.code(201);
    return { session };
  });

  app.post("/api/sessions/:id/message", async (request, reply) => {
    requireAuth(request, reply, auth);
    const payload = z
      .object({
        text: z.string().default(""),
        attachments: z
          .array(
            z.object({
              name: z.string().min(1),
              mimeType: z.string().min(1),
              size: z.number().int().nonnegative(),
              contentBase64: z.string().min(1),
            }),
          )
          .default([]),
      })
      .refine(
        (value) => value.text.trim().length > 0 || value.attachments.length > 0,
        "Message text or attachments are required",
      )
      .parse(request.body as SendMessageRequest);
    const sessionId = (request.params as { id: string }).id;
    await sessions.sendMessage(sessionId, payload.text, payload.attachments);
    const session = await sessions.getSession(sessionId);
    reply.code(202);
    return { session };
  });

  app.post("/api/sessions/:id/mode", async (request, reply) => {
    requireAuth(request, reply, auth);
    const payload = z.object({ mode: z.enum(["default", "plan"]) }).parse(
      request.body as UpdateModeRequest,
    );
    const session = await sessions.setMode((request.params as { id: string }).id, payload.mode);
    return { session };
  });

  app.post("/api/sessions/:id/preferences", async (request, reply) => {
    requireAuth(request, reply, auth);
    const payload = z
      .object({
        model: z.string().nullable().optional(),
        reasoningEffort: z
          .enum(["none", "minimal", "low", "medium", "high", "xhigh"])
          .nullable()
          .optional(),
        approvalPolicy: z
          .enum(["untrusted", "on-failure", "on-request", "never"])
          .optional(),
      })
      .parse(request.body as UpdateSessionPreferencesRequest);
    const session = await sessions.setPreferences((request.params as { id: string }).id, payload);
    return { session };
  });

  app.get("/api/sessions/:id/models", async (request, reply) => {
    requireAuth(request, reply, auth);
    return { data: await sessions.listModels((request.params as { id: string }).id) };
  });

  app.get("/api/sessions/:id/mcp/status", async (request, reply) => {
    requireAuth(request, reply, auth);
    return {
      data: await sessions.listMcpServerStatus((request.params as { id: string }).id),
      refreshedAt: Date.now(),
    };
  });

  app.post("/api/sessions/:id/approvals/:requestId", async (request, reply) => {
    requireAuth(request, reply, auth);
    const payload = z
      .object({
        decision: z.enum(["accept", "acceptForSession", "decline", "cancel"]),
        applyExecPolicyAmendment: z.boolean().optional(),
      })
      .parse(request.body as ResolveApprovalRequest);
    const session = await sessions.resolveApproval(
      (request.params as { id: string }).id,
      (request.params as { requestId: string }).requestId,
      payload,
    );
    return { session };
  });

  app.post("/api/history/import", async (request, reply) => {
    requireAuth(request, reply, auth);
    const payload = z
      .object({
        threadId: z.string().min(1),
        path: z.string().min(1),
        mode: z.enum(["default", "plan"]).optional(),
      })
      .parse(request.body as ImportHistoryRequest);

    const session = await sessions.importHistorySession(payload.threadId, payload.path, payload.mode);
    reply.code(201);
    return { session };
  });

  app.get("/api/workspaces/browse", async (request, reply) => {
    requireAuth(request, reply, auth);
    const currentPath =
      (request.query as { path?: string }).path ?? (await store.read()).settings.workspacePath;
    return browseWorkspace(currentPath);
  });

  app.get(
    "/api/sessions/:id/stream",
    { websocket: true },
    async (socket, request) => {
      const client = socket.socket as WebSocket;

      if (!auth.isSessionValid(request.cookies.codex_mobile_session)) {
        client.close(4401, "Unauthorized");
        return;
      }

      const sessionId = (request.params as { id: string }).id;
      const session = await sessions.getSession(sessionId);
      if (!session) {
        client.close(4404, "Session not found");
        return;
      }

      client.send(JSON.stringify({ kind: "snapshot", session }));

      const unsubscribe = await sessions.subscribe(sessionId, (event) => {
        client.send(JSON.stringify({ kind: "event", payload: event }));
      });

      client.on("close", unsubscribe);
    },
  );

  const staticRoot = path.resolve(options.workspacePath, "dist/client");
  if (await exists(staticRoot)) {
    await app.register(fastifyStatic, {
      root: staticRoot,
      prefix: "/",
    });

    app.setNotFoundHandler(async (request, reply) => {
      if (request.method !== "GET" || request.url.startsWith("/api")) {
        reply.code(404);
        return { error: "Not found" };
      }

      return reply.sendFile("index.html");
    });
  }

  return app;
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: AuthManager,
): void {
  if (!auth.isSessionValid(request.cookies.codex_mobile_session)) {
    reply.code(401);
    throw new Error("Unauthorized");
  }
}

function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie("codex_mobile_session", token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
  });
}
