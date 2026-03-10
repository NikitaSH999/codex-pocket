import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  setup: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  listSessions: vi.fn(),
  listHistory: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  forkSession: vi.fn(),
  sendMessage: vi.fn(),
  updateMode: vi.fn(),
  updatePreferences: vi.fn(),
  listModels: vi.fn(),
  listMcpStatus: vi.fn(),
  resolveApproval: vi.fn(),
  importHistory: vi.fn(),
  browseWorkspace: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("../../src/client/api", () => ({
  api: apiMocks,
}));

vi.mock("../../src/client/components/app-shell", () => ({
  AppShell: (props: any) => (
    <div>
      <div data-testid="auth-state">{props.authState}</div>
      <button type="button" onClick={() => props.onLogin("09042000")}>
        login
      </button>
    </div>
  ),
}));

import { App } from "../../src/client/app";

describe("App", () => {
  beforeEach(() => {
    apiMocks.getSettings.mockReset();
    apiMocks.setup.mockReset();
    apiMocks.login.mockReset();
    apiMocks.logout.mockReset();
    apiMocks.listSessions.mockReset();
    apiMocks.listHistory.mockReset();
    apiMocks.createSession.mockReset();
    apiMocks.getSession.mockReset();
    apiMocks.forkSession.mockReset();
    apiMocks.sendMessage.mockReset();
    apiMocks.updateMode.mockReset();
    apiMocks.updatePreferences.mockReset();
    apiMocks.listModels.mockReset();
    apiMocks.listMcpStatus.mockReset();
    apiMocks.resolveApproval.mockReset();
    apiMocks.importHistory.mockReset();
    apiMocks.browseWorkspace.mockReset();
    apiMocks.saveSettings.mockReset();

    apiMocks.setup.mockResolvedValue({ hasAuth: true, authenticated: true });
    apiMocks.login.mockResolvedValue({ hasAuth: true, authenticated: true });
    apiMocks.logout.mockResolvedValue({ hasAuth: true, authenticated: false });
    apiMocks.listSessions.mockResolvedValue({ sessions: [] });
    apiMocks.listHistory.mockResolvedValue({ entries: [] });
    apiMocks.createSession.mockResolvedValue({ session: null });
    apiMocks.getSession.mockResolvedValue({ session: null });
    apiMocks.forkSession.mockResolvedValue({ session: null });
    apiMocks.sendMessage.mockResolvedValue({ session: null });
    apiMocks.updateMode.mockResolvedValue({ session: null });
    apiMocks.updatePreferences.mockResolvedValue({ session: null });
    apiMocks.listModels.mockResolvedValue({ data: [] });
    apiMocks.listMcpStatus.mockResolvedValue({ data: [], refreshedAt: Date.now() });
    apiMocks.resolveApproval.mockResolvedValue({ session: null });
    apiMocks.importHistory.mockResolvedValue({ session: null });
    apiMocks.browseWorkspace.mockResolvedValue({
      currentPath: "C:\\Users\\kiwun\\Documents\\localapp",
      parentPath: "C:\\Users\\kiwun\\Documents",
      roots: ["C:\\"],
      entries: [],
    });
    apiMocks.saveSettings.mockResolvedValue({
      hasAuth: true,
      authenticated: true,
      workspacePath: "C:\\Users\\kiwun\\Documents\\localapp",
      defaultMode: "default",
      defaultModel: null,
      defaultReasoningEffort: null,
      defaultApprovalPolicy: "never",
      listenUrls: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("loads settings once on mount instead of spinning forever", async () => {
    apiMocks.getSettings.mockResolvedValue({
      hasAuth: true,
      authenticated: false,
      workspacePath: "C:\\Users\\kiwun\\Documents\\localapp",
      defaultMode: "default",
      defaultModel: null,
      defaultReasoningEffort: null,
      defaultApprovalPolicy: "never",
      listenUrls: [],
    });

    render(<App />);

    await waitFor(() => {
      expect(apiMocks.getSettings).toHaveBeenCalledTimes(1);
    });
  });

  it("refreshes settings exactly once after a successful login", async () => {
    apiMocks.getSettings
      .mockResolvedValueOnce({
        hasAuth: true,
        authenticated: false,
        workspacePath: "C:\\Users\\kiwun\\Documents\\localapp",
        defaultMode: "default",
        defaultModel: null,
        defaultReasoningEffort: null,
        defaultApprovalPolicy: "never",
        listenUrls: [],
      })
      .mockResolvedValueOnce({
        hasAuth: true,
        authenticated: true,
        workspacePath: "C:\\Users\\kiwun\\Documents\\localapp",
        defaultMode: "default",
        defaultModel: null,
        defaultReasoningEffort: null,
        defaultApprovalPolicy: "never",
        listenUrls: [],
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("login");
    });

    fireEvent.click(screen.getByRole("button", { name: "login" }));

    await waitFor(() => {
      expect(apiMocks.login).toHaveBeenCalledTimes(1);
      expect(apiMocks.getSettings).toHaveBeenCalledTimes(2);
    });
  });

  it(
    "polls sessions and history after authentication so IDE updates show up in the web UI",
    async () => {
    apiMocks.getSettings.mockResolvedValue({
      hasAuth: true,
      authenticated: true,
      workspacePath: "C:\\Users\\kiwun\\Documents\\localapp",
      defaultMode: "default",
      defaultModel: null,
      defaultReasoningEffort: null,
      defaultApprovalPolicy: "never",
      listenUrls: [],
    });

    render(<App />);

    await waitFor(() => {
      expect(apiMocks.listSessions).toHaveBeenCalledTimes(1);
      expect(apiMocks.listHistory).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 4100));
    });

    expect(apiMocks.listSessions).toHaveBeenCalledTimes(2);
    expect(apiMocks.listHistory).toHaveBeenCalledTimes(2);
    },
    10000,
  );
});
