import fs from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import type { BridgeConfigResponse } from "@codex-phone/shared";
import { z } from "zod";
import type { AuthService } from "./auth.js";
import type { CodexBridgeService } from "./codex/service.js";

const pairSchema = z.object({
  pin: z.string().min(4),
  deviceName: z.string().min(2).max(48)
});

const startSessionSchema = z.object({
  cwd: z.string().min(1)
});

const messageSchema = z.object({
  text: z.string().min(1)
});

const approvalSchema = z.object({
  decision: z.string().optional(),
  answers: z.record(z.string(), z.object({ answers: z.array(z.string()) })).optional()
});

export const createApp = (
  auth: AuthService,
  bridgeService: CodexBridgeService,
  configResponse: BridgeConfigResponse
) => {
  const app: Express = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/config", (_request, response) => {
    response.json(configResponse);
  });

  app.post("/api/auth/pair", (request, response) => {
    const parsed = pairSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const paired = auth.pair(parsed.data.pin, parsed.data.deviceName);
    if (!paired) {
      response.status(401).json({ error: "invalid_pin" });
      return;
    }

    response.json(paired);
  });

  app.use("/api", auth.authMiddleware);

  app.get("/api/sessions", async (_request, response, next) => {
    try {
      response.json(await bridgeService.listSessions());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/sessions/:id", async (request, response, next) => {
    try {
      response.json(await bridgeService.getSession(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/start", async (request, response, next) => {
    const parsed = startSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      response.json(await bridgeService.startSession(parsed.data.cwd));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:id/resume", async (request, response, next) => {
    try {
      response.json(await bridgeService.resumeSession(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:id/fork", async (request, response, next) => {
    try {
      response.json(await bridgeService.forkSession(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:id/archive", async (request, response, next) => {
    try {
      await bridgeService.archiveSession(request.params.id);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:id/message", async (request, response, next) => {
    const parsed = messageSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      await bridgeService.sendMessage(request.params.id, parsed.data.text);
      response.status(202).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces", async (_request, response, next) => {
    try {
      response.json(await bridgeService.listWorkspaces());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/approvals", (_request, response) => {
    response.json(bridgeService.listApprovals());
  });

  app.post("/api/approvals/:id/respond", async (request, response, next) => {
    const parsed = approvalSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      await bridgeService.respondToApproval(request.params.id, parsed.data);
      response.status(202).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/last-session", (_request, response) => {
    response.json({ threadId: bridgeService.getLastActiveThreadId() });
  });

  const mobileDist = path.resolve(process.cwd(), "apps", "mobile-pwa", "dist");
  if (fs.existsSync(mobileDist)) {
    app.use(express.static(mobileDist));
    app.get("*", (_request, response) => {
      response.sendFile(path.join(mobileDist, "index.html"));
    });
  }

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "unknown_error";
    response.status(500).json({ error: message });
  });

  return app;
};
