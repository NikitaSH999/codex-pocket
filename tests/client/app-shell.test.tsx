import type { ComponentProps } from "react";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "../../src/client/components/app-shell";
import type { CodexHistoryEntry, SessionRecord } from "../../src/shared/contracts";

describe("AppShell", () => {
  function renderShell(overrides?: Partial<ComponentProps<typeof AppShell>>) {
    const session: SessionRecord = {
      id: "session-1",
      threadId: "thread-1",
      title: "Новая сессия",
      cwd: "C:\\Users\\kiwun\\Documents\\localapp",
      createdAt: 1,
      updatedAt: 2,
      mode: "plan",
      preferences: {
        model: null,
        reasoningEffort: "medium",
        approvalPolicy: "never",
      },
      status: "running",
      messages: [
        {
          itemId: "user-1",
          turnId: "turn-1",
          role: "user",
          text: "Привет",
          state: "final",
          createdAt: 1,
        },
      ],
      activity: [
        {
          id: "activity-1",
          type: "status_update",
          turnId: "turn-1",
          status: "running",
          createdAt: 2,
        },
      ],
      commands: [],
      tools: [],
      planBlocks: [],
      approvals: [],
    };

    const props: ComponentProps<typeof AppShell> = {
      authenticated: true,
      currentSession: session,
      sessions: [session],
      selectedWorkspacePath: "C:\\Users\\kiwun\\Documents\\localapp",
      activeTab: "chat",
      onTabChange: () => undefined,
      onCreateSession: () => undefined,
      onForkSession: () => undefined,
      onSelectSession: () => undefined,
      onSelectWorkspace: () => undefined,
      onSendMessage: () => undefined,
      onToggleMode: () => undefined,
      onUpdatePreferences: async () => undefined,
      onResolveApproval: async () => undefined,
      onLogin: () => undefined,
      onSetup: () => undefined,
      historyEntries: [],
      onImportHistory: () => undefined,
      onSaveSettings: () => undefined,
      workspaceBrowser: null,
      onBrowseWorkspace: () => undefined,
      onQuickAction: async () => undefined,
      onLogout: async () => undefined,
      settings: {
        hasAuth: true,
        workspacePath: "C:\\Users\\kiwun\\Documents\\localapp",
        defaultMode: "default",
        defaultModel: null,
        defaultReasoningEffort: "medium",
        defaultApprovalPolicy: "never",
        listenUrls: [
          {
            label: "LAN",
            url: "http://192.168.3.73:4318",
          },
        ],
      },
      authState: "ready",
      modelOptions: [],
      mcpStatus: [],
      sessionDraft: "",
      composerAttachments: [],
      onDraftChange: () => undefined,
      onAddAttachments: () => undefined,
      onRemoveAttachment: () => undefined,
      ...overrides,
    };

    render(<AppShell {...props} />);
  }

  it("renders mobile navigation, plan toggle, and activity feed summary", () => {
    renderShell();

    expect(screen.getAllByRole("button", { name: /chat/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /activity/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /settings/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("checkbox", { name: /plan mode/i })).toBeChecked();
    expect(screen.getAllByText(/session draft/i).length).toBeGreaterThan(0);
  });

  it("keeps a new session action visible when there is no active session", () => {
    const onCreateSession = vi.fn();

    renderShell({
      currentSession: null,
      sessions: [],
      onCreateSession,
    });

    fireEvent.click(screen.getAllByRole("button", { name: /new in localapp/i })[0]);

    expect(onCreateSession).toHaveBeenCalledTimes(1);
  });

  it("lets the user choose the current browsed folder as workspace", () => {
    const onSaveSettings = vi.fn();

    renderShell({
      activeTab: "settings",
      workspaceBrowser: {
        currentPath: "C:\\Users\\kiwun\\Documents",
        parentPath: "C:\\Users\\kiwun",
        roots: ["C:\\"],
        entries: [
          {
            name: "localapp",
            path: "C:\\Users\\kiwun\\Documents\\localapp",
            kind: "directory",
          },
        ],
      },
      onSaveSettings,
    });

    fireEvent.click(screen.getByRole("button", { name: /use current folder/i }));
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    expect(onSaveSettings).toHaveBeenCalledWith({
      workspacePath: "C:\\Users\\kiwun\\Documents",
      defaultMode: "default",
      defaultModel: null,
      defaultReasoningEffort: "medium",
      defaultApprovalPolicy: "never",
    });
  });

  it("groups sessions and history by workspace and creates a scoped session", () => {
    const onCreateSession = vi.fn();
    const onSelectWorkspace = vi.fn();
    const vpnSession: SessionRecord = {
      id: "session-2",
      threadId: "thread-2",
      title: "VPN issue",
      cwd: "C:\\Users\\kiwun\\Documents\\VPN",
      createdAt: 2,
      updatedAt: 3,
      mode: "default",
      preferences: {
        model: null,
        reasoningEffort: "medium",
        approvalPolicy: "never",
      },
      status: "idle",
      messages: [],
      activity: [],
      commands: [],
      tools: [],
      planBlocks: [],
      approvals: [],
    };
    const vpnHistory: CodexHistoryEntry = {
      threadId: "history-vpn",
      path: "C:\\Users\\kiwun\\.codex\\sessions\\history-vpn.jsonl",
      cwd: "C:\\Users\\kiwun\\Documents\\VPN",
      preview: "Fix VPN tunnel",
      source: "codex",
      createdAt: 2,
      updatedAt: 4,
    };

    renderShell({
      sessions: [
        {
          id: "session-1",
          threadId: "thread-1",
          title: "Localapp issue",
          cwd: "C:\\Users\\kiwun\\Documents\\localapp",
          createdAt: 1,
          updatedAt: 5,
          mode: "plan",
          preferences: {
            model: null,
            reasoningEffort: "medium",
            approvalPolicy: "never",
          },
          status: "running",
          messages: [],
          activity: [],
          commands: [],
          tools: [],
          planBlocks: [],
          approvals: [],
        },
        vpnSession,
      ],
      currentSession: vpnSession,
      selectedWorkspacePath: "C:\\Users\\kiwun\\Documents\\VPN",
      historyEntries: [vpnHistory],
      onCreateSession,
      onSelectWorkspace,
    });

    expect(screen.getAllByRole("button", { name: /vpn workspace/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/fix vpn tunnel/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /new in vpn/i })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /vpn workspace/i })[0]);

    expect(onCreateSession).toHaveBeenCalledWith("C:\\Users\\kiwun\\Documents\\VPN");
    expect(onSelectWorkspace).toHaveBeenCalledWith("C:\\Users\\kiwun\\Documents\\VPN");
  });

  it("forks the current session from the header action", () => {
    const onForkSession = vi.fn();

    renderShell({
      onForkSession,
    });

    fireEvent.click(screen.getByRole("button", { name: /fork session/i }));

    expect(onForkSession).toHaveBeenCalledTimes(1);
  });

  it("shows slash commands for quick actions inside the composer", async () => {
    const onQuickAction = vi.fn(async () => undefined);

    renderShell({
      sessionDraft: "/pla",
      onQuickAction,
    });

    fireEvent.click(
      within(screen.getByRole("menu", { name: /slash commands/i })).getByRole("button", {
        name: /plan mode/i,
      }),
    );

    expect(onQuickAction).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "set-mode",
        mode: "plan",
      }),
    );
  });

  it("shows MCP tool names in the activity summary", () => {
    renderShell({
      activeTab: "activity",
      mcpStatus: [
        {
          name: "filesystem",
          authStatus: "ready",
          toolCount: 4,
          resourceCount: 2,
          resourceTemplateCount: 1,
          toolNames: ["read_file", "write_file", "list_dir"],
          resourceNames: ["workspace"],
          resourceTemplateNames: ["repo://{branch}"],
        },
      ],
    });

    expect(screen.getByText("read_file")).toBeInTheDocument();
    expect(screen.getByText("workspace")).toBeInTheDocument();
    expect(screen.getByText("repo://{branch}")).toBeInTheDocument();
  });

  it("renders the VPN promo widget with a visible CTA", () => {
    renderShell({
      activeTab: "settings",
    });

    expect(screen.getByText(/professional connection shield/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /connect free usa vpn/i })).toHaveAttribute(
      "href",
      "https://t.me/portal_service_bot",
    );
  });

  it("sends a message with ctrl enter from the composer", () => {
    const onSendMessage = vi.fn();

    renderShell({
      sessionDraft: "ship it",
      onSendMessage,
    });

    fireEvent.keyDown(
      screen.getByPlaceholderText(/ask codex anything/i),
      {
        key: "Enter",
        code: "Enter",
        ctrlKey: true,
      },
    );

    expect(onSendMessage).toHaveBeenCalledTimes(1);
  });

  it("sends a message with enter when the composer is not in slash mode", () => {
    const onSendMessage = vi.fn();

    renderShell({
      sessionDraft: "ship it faster",
      onSendMessage,
    });

    fireEvent.keyDown(screen.getByPlaceholderText(/ask codex anything/i), {
      key: "Enter",
      code: "Enter",
    });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
  });

  it("runs the first slash action when enter is pressed", () => {
    const onQuickAction = vi.fn(async () => undefined);

    renderShell({
      sessionDraft: "/pla",
      onQuickAction,
    });

    fireEvent.keyDown(
      screen.getByPlaceholderText(/ask codex anything/i),
      {
        key: "Enter",
        code: "Enter",
      },
    );

    expect(onQuickAction).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "set-mode",
        mode: "plan",
      }),
    );
  });

  it("matches fork as a slash action", async () => {
    const onQuickAction = vi.fn(async () => undefined);

    renderShell({
      sessionDraft: "/fork",
      onQuickAction,
    });

    fireEvent.click(
      within(screen.getByRole("menu", { name: /slash commands/i })).getByRole("button", {
        name: /fork session/i,
      }),
    );

    expect(onQuickAction).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "fork-session",
      }),
    );
  });
});
