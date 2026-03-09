import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/server/app";

describe("auth api", () => {
  afterEach(async () => {
    await build?.close();
    build = undefined;
  });

  let build: Awaited<ReturnType<typeof buildApp>> | undefined;

  it("sets up a PIN, rejects a bad login, and accepts a valid login with a cookie session", async () => {
    const dataDir = path.join(
      "C:\\Users\\kiwun\\Documents\\localapp",
      `.tmp-test-auth-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    await rm(dataDir, { recursive: true, force: true });

    build = await buildApp({
      dataDir,
      workspacePath: "C:\\Users\\kiwun\\Documents\\localapp",
      enforceNetworkGuard: false,
      codexFactory: () => {
        throw new Error("not used in auth test");
      },
    });

    const setupResponse = await build.inject({
      method: "POST",
      url: "/api/auth/setup",
      payload: { pin: "1234" },
    });

    expect(setupResponse.statusCode).toBe(200);
    expect(setupResponse.json()).toMatchObject({ hasAuth: true });

    const badLogin = await build.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { pin: "9999" },
    });

    expect(badLogin.statusCode).toBe(401);

    const login = await build.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { pin: "1234" },
    });

    expect(login.statusCode).toBe(200);
    expect(login.cookies[0]?.name).toBe("codex_mobile_session");

    const settings = await build.inject({
      method: "GET",
      url: "/api/settings",
      cookies: {
        codex_mobile_session: login.cookies[0]?.value ?? "",
      },
    });

    expect(settings.statusCode).toBe(200);
    expect(settings.json()).toMatchObject({
      workspacePath: "C:\\Users\\kiwun\\Documents\\localapp",
      hasAuth: true,
    });
  });

  it("lists workspace folders for the web file browser", async () => {
    const dataDir = path.join(
      "C:\\Users\\kiwun\\Documents\\localapp",
      `.tmp-test-browse-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const workspaceRoot = path.join(dataDir, "workspace");
    const childDir = path.join(workspaceRoot, "child-project");

    await rm(dataDir, { recursive: true, force: true });
    await mkdir(childDir, { recursive: true });

    build = await buildApp({
      dataDir,
      workspacePath: workspaceRoot,
      enforceNetworkGuard: false,
      codexFactory: () => {
        throw new Error("not used in browse test");
      },
    });

    const setup = await build.inject({
      method: "POST",
      url: "/api/auth/setup",
      payload: { pin: "1234" },
    });

    const browse = await build.inject({
      method: "GET",
      url: `/api/workspaces/browse?path=${encodeURIComponent(workspaceRoot)}`,
      cookies: {
        codex_mobile_session: setup.cookies[0]?.value ?? "",
      },
    });

    expect(browse.statusCode).toBe(200);
    expect(browse.json()).toMatchObject({
      currentPath: workspaceRoot,
    });
    expect(browse.json().entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "child-project",
          path: childDir,
          kind: "directory",
        }),
      ]),
    );
  });

  it("creates a new session inside the explicitly selected workspace", async () => {
    const dataDir = path.join(
      "C:\\Users\\kiwun\\Documents\\localapp",
      `.tmp-test-workspace-session-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const workspaceRoot = path.join(dataDir, "workspace");
    const childDir = path.join(workspaceRoot, "vpn");

    await rm(dataDir, { recursive: true, force: true });
    await mkdir(childDir, { recursive: true });

    build = await buildApp({
      dataDir,
      workspacePath: workspaceRoot,
      enforceNetworkGuard: false,
      codexFactory: async ({ cwd, threadId }) => ({
        threadId: threadId ?? `thread-${path.basename(cwd)}`,
        cwd,
        model: "gpt-5.4",
        onNotification: () => () => undefined,
        onServerRequest: () => () => undefined,
        onStderr: () => () => undefined,
        sendUserMessage: async () => undefined,
        forkThread: async () => ({
          threadId: threadId ?? `thread-${path.basename(cwd)}-fork`,
          cwd,
          model: "gpt-5.4",
        }),
        listModels: async () => [],
        listMcpServerStatus: async () => [],
        respondToServerRequest: () => undefined,
        dispose: async () => undefined,
      }),
    });

    const setup = await build.inject({
      method: "POST",
      url: "/api/auth/setup",
      payload: { pin: "1234" },
    });

    const create = await build.inject({
      method: "POST",
      url: "/api/sessions",
      cookies: {
        codex_mobile_session: setup.cookies[0]?.value ?? "",
      },
      payload: {
        workspacePath: childDir,
      },
    });

    expect(create.statusCode).toBe(201);
    expect(create.json()).toMatchObject({
      session: {
        cwd: childDir,
      },
    });
  });

  it("forks a session into a new thread in the same workspace", async () => {
    const dataDir = path.join(
      "C:\\Users\\kiwun\\Documents\\localapp",
      `.tmp-test-fork-session-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const workspaceRoot = path.join(dataDir, "workspace");

    await rm(dataDir, { recursive: true, force: true });
    await mkdir(workspaceRoot, { recursive: true });

    build = await buildApp({
      dataDir,
      workspacePath: workspaceRoot,
      enforceNetworkGuard: false,
      codexFactory: async ({ cwd, threadId }) => ({
        threadId: threadId ?? "thread-original",
        cwd,
        model: "gpt-5.4",
        onNotification: () => () => undefined,
        onServerRequest: () => () => undefined,
        onStderr: () => () => undefined,
        sendUserMessage: async () => undefined,
        listModels: async () => [],
        listMcpServerStatus: async () => [],
        respondToServerRequest: () => undefined,
        forkThread: async () => ({
          threadId: "thread-forked",
          cwd,
          model: "gpt-5.4",
        }),
        dispose: async () => undefined,
      }),
    });

    const setup = await build.inject({
      method: "POST",
      url: "/api/auth/setup",
      payload: { pin: "1234" },
    });

    const create = await build.inject({
      method: "POST",
      url: "/api/sessions",
      cookies: {
        codex_mobile_session: setup.cookies[0]?.value ?? "",
      },
      payload: {
        workspacePath: workspaceRoot,
      },
    });

    const originalSessionId = create.json().session.id;
    const fork = await build.inject({
      method: "POST",
      url: `/api/sessions/${originalSessionId}/fork`,
      cookies: {
        codex_mobile_session: setup.cookies[0]?.value ?? "",
      },
    });

    expect(fork.statusCode).toBe(201);
    expect(fork.json()).toMatchObject({
      session: {
        id: "thread-forked",
        threadId: "thread-forked",
        cwd: workspaceRoot,
        status: "idle",
      },
    });
  });

  it("serves built asset files with their file content instead of the SPA fallback", async () => {
    const dataDir = path.join(
      "C:\\Users\\kiwun\\Documents\\localapp",
      `.tmp-test-static-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const workspaceRoot = path.join(dataDir, "workspace");
    const clientRoot = path.join(workspaceRoot, "dist", "client");
    const assetPath = path.join(clientRoot, "assets", "app.js");

    await rm(dataDir, { recursive: true, force: true });
    await mkdir(path.dirname(assetPath), { recursive: true });
    await writeFile(path.join(clientRoot, "index.html"), "<!doctype html><div id=\"root\"></div>", "utf8");
    await writeFile(assetPath, "console.log('asset-ok');", "utf8");

    build = await buildApp({
      dataDir,
      workspacePath: workspaceRoot,
      enforceNetworkGuard: false,
      codexFactory: () => {
        throw new Error("not used in static asset test");
      },
    });

    const assetResponse = await build.inject({
      method: "GET",
      url: "/assets/app.js",
    });

    expect(assetResponse.statusCode).toBe(200);
    expect(assetResponse.headers["content-type"]).toContain("javascript");
    expect(assetResponse.body).toContain("asset-ok");
  });
});
