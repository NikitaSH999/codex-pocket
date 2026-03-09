import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import type {
  CodexHistoryEntry,
  SessionRecord,
  SessionStreamMessage,
  SettingsResponse,
  UpdateSettingsRequest,
  WorkspaceBrowserResponse,
} from "../shared/contracts";
import { api } from "./api";
import { AppShell, type ShellQuickAction, type ShellTab } from "./components/app-shell";

type AuthState = "booting" | "setup" | "login" | "ready" | "busy";

const FALLBACK_SETTINGS: SettingsResponse = {
  hasAuth: false,
  authenticated: false,
  workspacePath: "",
  defaultMode: "default",
  listenUrls: [],
};

export function App() {
  const [settings, setSettings] = useState<SettingsResponse>(FALLBACK_SETTINGS);
  const [authState, setAuthState] = useState<AuthState>("booting");
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [historyEntries, setHistoryEntries] = useState<CodexHistoryEntry[]>([]);
  const [workspaceBrowser, setWorkspaceBrowser] = useState<WorkspaceBrowserResponse | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ShellTab>("chat");
  const [sessionDraft, setSessionDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [streamGeneration, setStreamGeneration] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const authenticated = settings.authenticated ?? false;
  const currentSession = activeSessionId
    ? sessions.find((session) => session.id === activeSessionId) ?? null
    : null;

  const refreshShell = useEffectEvent(async () => {
    try {
      const nextSettings = await api.getSettings();
      startTransition(() => {
        setSettings(nextSettings);
        setAuthState(resolveAuthState(nextSettings));
      });

      if (nextSettings.authenticated) {
        const list = await api.listSessions();
        const history = await api.listHistory();
        const browser = await api.browseWorkspace(nextSettings.workspacePath);
        startTransition(() => {
          setSessions(list.sessions);
          setHistoryEntries(history.entries);
          setWorkspaceBrowser(browser);
          setActiveSessionId((current) =>
            current && list.sessions.some((session) => session.id === current)
              ? current
              : list.sessions[0]?.id ?? null,
          );
          setSelectedWorkspacePath(
            (current) => current ?? list.sessions[0]?.cwd ?? nextSettings.workspacePath,
          );
        });
      } else {
        startTransition(() => {
          setSessions([]);
          setHistoryEntries([]);
          setWorkspaceBrowser(null);
          setActiveSessionId(null);
          setSelectedWorkspacePath(null);
        });
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Failed to load the app.";
      startTransition(() => {
        setError(message);
        setAuthState("login");
      });
    }
  });

  useEffect(() => {
    void refreshShell();
  }, [refreshShell]);

  const applySessionSnapshot = useEffectEvent((session: SessionRecord) => {
    startTransition(() => {
      setSessions((current) => {
        const next = [...current];
        const index = next.findIndex((item) => item.id === session.id);
        if (index >= 0) {
          next[index] = session;
        } else {
          next.unshift(session);
        }

        next.sort((left, right) => right.updatedAt - left.updatedAt);
        return next;
      });
      setActiveSessionId((current) => current ?? session.id);
      setSelectedWorkspacePath((current) => current ?? session.cwd);
    });
  });

  useEffect(() => {
    if (!currentSession?.cwd) {
      return;
    }

    setSelectedWorkspacePath(currentSession.cwd);
  }, [currentSession?.cwd]);

  const refreshCurrentSession = useEffectEvent(async (sessionId: string) => {
    try {
      const response = await api.getSession(sessionId);
      applySessionSnapshot(response.session);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to refresh the session.");
    }
  });

  useEffect(() => {
    if (!authenticated || !currentSession) {
      socketRef.current?.close();
      socketRef.current = null;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(
      `${protocol}://${window.location.host}/api/sessions/${currentSession.id}/stream`,
    );
    let disposed = false;

    socket.onopen = () => {
      reconnectAttemptsRef.current = 0;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      setError((current) =>
        current === "The live Codex stream disconnected." ? null : current,
      );
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as SessionStreamMessage;
        if (payload.kind === "snapshot") {
          applySessionSnapshot(payload.session);
          return;
        }

        applySessionSnapshot(payload.payload.snapshot);
      } catch {
        setError("Unable to parse live session updates.");
      }
    };

    socket.onerror = () => {
      socket.close();
    };

    socket.onclose = () => {
      if (disposed) {
        return;
      }

      void refreshCurrentSession(currentSession.id);

      const attempt = reconnectAttemptsRef.current + 1;
      reconnectAttemptsRef.current = attempt;
      const timeoutMs = Math.min(1000 * attempt, 5000);

      reconnectTimerRef.current = window.setTimeout(() => {
        setStreamGeneration((current) => current + 1);
      }, timeoutMs);

      setError("The live Codex stream disconnected.");
    };

    socketRef.current = socket;
    return () => {
      disposed = true;
      socket.close();
      socketRef.current = null;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [applySessionSnapshot, authenticated, currentSession?.id, refreshCurrentSession, streamGeneration]);

  async function handleSetup(pin: string) {
    setAuthState("busy");
    setError(null);
    try {
      await api.setup(pin);
      await refreshShell();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Setup failed.");
      setAuthState("setup");
    }
  }

  async function handleLogin(pin: string) {
    setAuthState("busy");
    setError(null);
    try {
      await api.login(pin);
      await refreshShell();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Login failed.");
      setAuthState("login");
    }
  }

  async function handleCreateSession(workspacePath?: string) {
    if (!authenticated) {
      return;
    }

    setError(null);
    try {
      const targetWorkspace = workspacePath ?? selectedWorkspacePath ?? settings.workspacePath;
      const response = await api.createSession({
        mode: settings.defaultMode,
        workspacePath: targetWorkspace,
      });
      applySessionSnapshot(response.session);
      setActiveSessionId(response.session.id);
      setSelectedWorkspacePath(response.session.cwd);
      setActiveTab("chat");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Session creation failed.");
    }
  }

  async function handleImportHistory(threadId: string, historyPath: string) {
    setError(null);
    try {
      const response = await api.importHistory({
        threadId,
        path: historyPath,
        mode: settings.defaultMode,
      });
      applySessionSnapshot(response.session);
      setActiveSessionId(response.session.id);
      setSelectedWorkspacePath(response.session.cwd);
      setActiveTab("chat");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "History import failed.");
    }
  }

  async function handleSendMessage() {
    if (!currentSession || !sessionDraft.trim()) {
      return;
    }

    const text = sessionDraft.trim();
    setSessionDraft("");
    setError(null);

    try {
      const response = await api.sendMessage(currentSession.id, { text });
      applySessionSnapshot(response.session);
    } catch (caughtError) {
      setSessionDraft(text);
      setError(caughtError instanceof Error ? caughtError.message : "Message send failed.");
    }
  }

  async function handleToggleMode(checked: boolean) {
    if (!currentSession) {
      return;
    }

    setError(null);
    try {
      const response = await api.updateMode(currentSession.id, {
        mode: checked ? "plan" : "default",
      });
      applySessionSnapshot(response.session);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Mode update failed.");
    }
  }

  async function handleSaveSettings(payload: UpdateSettingsRequest) {
    setError(null);
    try {
      const nextSettings = await api.saveSettings(payload);
      const history = await api.listHistory();
      const browser = await api.browseWorkspace(nextSettings.workspacePath);
      startTransition(() => {
        setSettings(nextSettings);
        setHistoryEntries(history.entries);
        setWorkspaceBrowser(browser);
        setSelectedWorkspacePath((current) => current ?? nextSettings.workspacePath);
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Settings update failed.");
    }
  }

  async function handleBrowseWorkspace(targetPath?: string) {
    setError(null);
    try {
      const browser = await api.browseWorkspace(targetPath);
      setWorkspaceBrowser(browser);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Workspace browse failed.");
    }
  }

  function handleSelectWorkspace(workspacePath: string) {
    setSelectedWorkspacePath(workspacePath);
    setActiveSessionId(sessions.find((session) => session.cwd === workspacePath)?.id ?? null);
    setActiveTab("chat");
  }

  async function handleQuickAction(action: ShellQuickAction) {
    switch (action.kind) {
      case "set-mode":
        if (currentSession) {
          await handleToggleMode(action.mode === "plan");
          return;
        }

        await handleSaveSettings({ defaultMode: action.mode });
        return;
      case "open-tab":
        setActiveTab(action.tab);
        return;
      case "select-workspace":
        handleSelectWorkspace(action.workspacePath);
        return;
      case "create-session":
        await handleCreateSession(action.workspacePath);
        return;
    }
  }

  return (
    <AppShell
      authenticated={authenticated}
      currentSession={currentSession}
      sessions={sessions}
      selectedWorkspacePath={selectedWorkspacePath ?? settings.workspacePath}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onCreateSession={handleCreateSession}
      onSelectSession={(sessionId) => {
        const nextSession = sessions.find((session) => session.id === sessionId) ?? null;
        setActiveSessionId(sessionId);
        setSelectedWorkspacePath(nextSession?.cwd ?? selectedWorkspacePath ?? settings.workspacePath);
        setError(null);
        setActiveTab("chat");
      }}
      onSelectWorkspace={handleSelectWorkspace}
      onSendMessage={handleSendMessage}
      onToggleMode={handleToggleMode}
      onLogin={handleLogin}
      onSetup={handleSetup}
      historyEntries={historyEntries}
      onImportHistory={handleImportHistory}
      onSaveSettings={handleSaveSettings}
      workspaceBrowser={workspaceBrowser}
      onBrowseWorkspace={handleBrowseWorkspace}
      onQuickAction={handleQuickAction}
      settings={settings}
      authState={authState === "booting" ? "login" : authState}
      sessionDraft={sessionDraft}
      onDraftChange={setSessionDraft}
      error={error}
      onDismissError={() => setError(null)}
    />
  );
}

function resolveAuthState(settings: SettingsResponse): AuthState {
  if (!settings.hasAuth) {
    return "setup";
  }

  if (!settings.authenticated) {
    return "login";
  }

  return "ready";
}
