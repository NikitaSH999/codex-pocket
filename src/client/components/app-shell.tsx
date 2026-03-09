import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

import type {
  ActivityItem,
  CodexHistoryEntry,
  SessionMessage,
  SessionRecord,
  SettingsResponse,
  UpdateSettingsRequest,
  WorkspaceBrowserResponse,
} from "../../shared/contracts";

export type ShellTab = "chat" | "activity" | "sessions" | "settings";
export type ShellAuthState = "setup" | "login" | "ready" | "busy";
export type ShellQuickAction =
  | { kind: "set-mode"; mode: "default" | "plan" }
  | { kind: "open-tab"; tab: ShellTab }
  | { kind: "select-workspace"; workspacePath: string }
  | { kind: "create-session"; workspacePath: string };

interface AppShellProps {
  authenticated: boolean;
  currentSession: SessionRecord | null;
  sessions: SessionRecord[];
  selectedWorkspacePath: string;
  activeTab: ShellTab;
  onTabChange: (tab: ShellTab) => void;
  onCreateSession: (workspacePath?: string) => void;
  onSelectSession: (sessionId: string) => void;
  onSelectWorkspace: (workspacePath: string) => void;
  onSendMessage: () => void;
  onToggleMode: (checked: boolean) => void;
  onLogin: (pin: string) => void;
  onSetup: (pin: string) => void;
  historyEntries: CodexHistoryEntry[];
  onImportHistory: (threadId: string, historyPath: string) => void;
  onSaveSettings: (payload: UpdateSettingsRequest) => void;
  workspaceBrowser: WorkspaceBrowserResponse | null;
  onBrowseWorkspace: (targetPath?: string) => void;
  onQuickAction: (action: ShellQuickAction) => Promise<void> | void;
  onLogout: () => Promise<void> | void;
  settings: SettingsResponse;
  authState: ShellAuthState;
  sessionDraft: string;
  onDraftChange: (value: string) => void;
  error?: string | null;
  onDismissError?: () => void;
}

interface WorkspaceGroup {
  path: string;
  label: string;
  sessions: SessionRecord[];
  history: CodexHistoryEntry[];
  lastTouchedAt: number;
  selected: boolean;
}

interface QuickActionOption {
  id: string;
  label: string;
  description: string;
  action: ShellQuickAction;
}

export function AppShell({
  authenticated,
  currentSession,
  sessions,
  selectedWorkspacePath,
  activeTab,
  onTabChange,
  onCreateSession,
  onSelectSession,
  onSelectWorkspace,
  onSendMessage,
  onToggleMode,
  onLogin,
  onSetup,
  historyEntries,
  onImportHistory,
  onSaveSettings,
  workspaceBrowser,
  onBrowseWorkspace,
  onQuickAction,
  onLogout,
  settings,
  authState,
  sessionDraft,
  onDraftChange,
  error = null,
  onDismissError,
}: AppShellProps) {
  const [pin, setPin] = useState("");
  const [workspaceDraft, setWorkspaceDraft] = useState(settings.workspacePath);
  const [defaultModeDraft, setDefaultModeDraft] = useState(settings.defaultMode);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);

  useEffect(() => {
    setWorkspaceDraft(settings.workspacePath);
    setDefaultModeDraft(settings.defaultMode);
  }, [settings.defaultMode, settings.workspacePath]);

  const workspaceGroups = useMemo(
    () =>
      buildWorkspaceGroups({
        sessions,
        historyEntries,
        selectedWorkspacePath,
        defaultWorkspacePath: settings.workspacePath,
        currentWorkspacePath: currentSession?.cwd,
      }),
    [currentSession?.cwd, historyEntries, selectedWorkspacePath, sessions, settings.workspacePath],
  );
  const activeWorkspacePath = currentSession?.cwd ?? selectedWorkspacePath ?? settings.workspacePath;
  const activeWorkspaceLabel = formatWorkspaceLabel(activeWorkspacePath);
  const visibleActivity = currentSession?.activity ?? [];
  const slashQuery = getSlashQuery(sessionDraft);
  const quickActions = useMemo(
    () => buildQuickActions(currentSession, activeWorkspacePath, workspaceGroups),
    [activeWorkspacePath, currentSession, workspaceGroups],
  );
  const visibleQuickActions = useMemo(() => {
    if (slashQuery === null) {
      return quickActions;
    }

    const query = slashQuery.toLowerCase();
    return quickActions.filter((action) =>
      `${action.label} ${action.description}`.toLowerCase().includes(query),
    );
  }, [quickActions, slashQuery]);

  async function runQuickAction(action: ShellQuickAction): Promise<void> {
    await onQuickAction(action);
    setQuickMenuOpen(false);
    onDraftChange("");
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Escape") {
      setQuickMenuOpen(false);
      return;
    }

    if (event.key === "Enter" && slashQuery !== null && !event.shiftKey) {
      if (!visibleQuickActions.length) {
        return;
      }

      event.preventDefault();
      void runQuickAction(visibleQuickActions[0].action);
      return;
    }

    if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      slashQuery === null &&
      currentSession &&
      sessionDraft.trim()
    ) {
      event.preventDefault();
      onSendMessage();
    }
  }

  if (!authenticated) {
    return (
      <div className="shell shell--auth">
        <div className="auth-card">
          <div className="hero-badge">Codex Switchboard</div>
          <h1>{authState === "setup" ? "Secure this device" : "Unlock your local Codex"}</h1>
          <p>
            Local Codex access from phone or desktop, with a live feed of what the agent is
            doing in the current workspace.
          </p>
          <label className="field">
            <span>PIN</span>
            <input
              autoFocus
              inputMode="numeric"
              minLength={4}
              type="password"
              value={pin}
              placeholder="Enter 4+ digits"
              onChange={(event) => setPin(event.target.value)}
            />
          </label>
          {error ? (
            <div className="banner banner--error" role="alert">
              <span>{error}</span>
              {onDismissError ? (
                <button type="button" onClick={onDismissError}>
                  Dismiss
                </button>
              ) : null}
            </div>
          ) : null}
          <button
            className="primary-button"
            disabled={authState === "busy" || pin.trim().length < 4}
            type="button"
            onClick={() => (authState === "setup" ? onSetup(pin) : onLogin(pin))}
          >
            {authState === "setup" ? "Create local PIN" : "Unlock console"}
          </button>
          <div className="auth-meta">
            {settings.listenUrls.map((listenUrl) => (
              <span key={listenUrl.url}>
                {listenUrl.label}: {listenUrl.url}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail__header">
          <div>
            <div className="hero-badge">LAN / Static IP</div>
            <h1>Codex Switchboard</h1>
          </div>
          <button className="secondary-button" type="button" onClick={() => onCreateSession(activeWorkspacePath)}>
            New
          </button>
        </div>
        <section className="rail__section">
          <div className="section-heading">
            <span>Reachable at</span>
          </div>
          <div className="listen-grid">
            {settings.listenUrls.map((listenUrl) => (
              <div className="listen-card" key={listenUrl.url}>
                <span>{listenUrl.label}</span>
                <strong>{listenUrl.url}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="rail__section">
          <div className="section-heading">
            <span>Workspace board</span>
            <strong>{workspaceGroups.length}</strong>
          </div>
          <div className="workspace-group-list">
            {workspaceGroups.map((group) => (
              <WorkspaceGroupCard
                currentSessionId={currentSession?.id ?? null}
                group={group}
                key={group.path}
                onCreateSession={onCreateSession}
                onImportHistory={onImportHistory}
                onSelectSession={onSelectSession}
                onSelectWorkspace={onSelectWorkspace}
              />
            ))}
          </div>
        </section>
      </aside>

      <main className="console">
        <header className="console__header">
          <div>
            <p className="eyebrow">{currentSession ? "Current session" : "Current workspace"}</p>
            <h2>{currentSession ? compactSessionTitle(currentSession.title) : `${activeWorkspaceLabel} workspace`}</h2>
            <p className="console__path">{activeWorkspacePath}</p>
            <div className="console__meta">
              <span className={`status-pill status-pill--${currentSession?.status ?? "idle"}`}>
                {currentSession?.status ?? "ready"}
              </span>
              <span className="meta-pill">{currentSession?.mode === "plan" ? "plan mode" : "default mode"}</span>
              <span className="meta-pill">{`${workspaceGroups.length} workspaces`}</span>
            </div>
          </div>
          <div className="console__actions">
            <button className="secondary-button" type="button" onClick={() => onCreateSession(activeWorkspacePath)}>
              {`New in ${activeWorkspaceLabel}`}
            </button>
            <div className="quick-menu-shell">
              <button
                aria-expanded={quickMenuOpen}
                className="secondary-button"
                type="button"
                onClick={() => setQuickMenuOpen((current) => !current)}
              >
                Quick /
              </button>
              {quickMenuOpen ? (
                <div className="quick-menu" role="menu" aria-label="Quick actions">
                  {quickActions.map((action) => (
                    <button className="quick-menu__item" key={action.id} type="button" onClick={() => void runQuickAction(action.action)}>
                      <strong>{action.label}</strong>
                      <span>{action.description}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <label className="mode-toggle">
              <span>Structured</span>
              <input
                aria-label="Plan mode"
                checked={currentSession?.mode === "plan"}
                disabled={!currentSession}
                type="checkbox"
                onChange={(event) => onToggleMode(event.target.checked)}
              />
            </label>
          </div>
        </header>
        {error ? (
          <div className="banner banner--error" role="alert">
            <span>{error}</span>
            {onDismissError ? (
              <button type="button" onClick={onDismissError}>
                Dismiss
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="workspace">
          <section className={`panel panel--chat${activeTab === "chat" ? " panel--active" : ""}`}>
            <div className="panel__header">
              <h3>Chat</h3>
              <span>{currentSession?.status ?? "ready"}</span>
            </div>
            <div className="message-list">
              {(currentSession?.messages ?? []).map((message) => (
                <MessageBubble key={message.itemId} message={message} />
              ))}
              {!currentSession ? (
                <div className="empty-state">
                  <div className="empty-state__content">
                    <p>{`Selected workspace: ${activeWorkspaceLabel}`}</p>
                    <span>{activeWorkspacePath}</span>
                    <button className="primary-button" type="button" onClick={() => onCreateSession(activeWorkspacePath)}>
                      {`New in ${activeWorkspaceLabel}`}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="composer">
              <textarea
                placeholder="Send a task, ask for a plan, or continue a local coding session..."
                value={sessionDraft}
                onKeyDown={handleComposerKeyDown}
                onChange={(event) => onDraftChange(event.target.value)}
              />
              {slashQuery !== null ? (
                <div className="slash-menu" role="menu" aria-label="Slash commands">
                  {visibleQuickActions.length ? (
                    visibleQuickActions.map((action) => (
                      <button className="slash-menu__item" key={action.id} type="button" onClick={() => void runQuickAction(action.action)}>
                        <strong>{action.label}</strong>
                        <span>{action.description}</span>
                      </button>
                    ))
                  ) : (
                    <div className="slash-menu__empty">No quick actions match this command.</div>
                  )}
                </div>
              ) : null}
              <div className="composer__footer">
                <span className="composer__hint">
                  {`/ for quick actions, Ctrl+Enter to send, workspace: ${activeWorkspaceLabel}`}
                </span>
                <button
                  className="primary-button"
                  disabled={!currentSession || !sessionDraft.trim() || slashQuery !== null}
                  type="button"
                  onClick={onSendMessage}
                >
                  Send
                </button>
              </div>
            </div>
          </section>

          <section className={`panel panel--activity${activeTab === "activity" ? " panel--active" : ""}`}>
            <div className="panel__header">
              <h3>Activity</h3>
              <span>{visibleActivity.length}</span>
            </div>
            <div className="activity-list">
              {visibleActivity.map((item) => (
                <ActivityRow item={item} key={item.id} />
              ))}
            </div>
            {!!currentSession?.commands.length && (
              <div className="subpanel">
                <div className="section-heading">
                  <span>Commands</span>
                </div>
                {currentSession.commands.map((command) => (
                  <article className="log-card" key={command.itemId}>
                    <header>
                      <strong>{command.command}</strong>
                      <span>{command.status}</span>
                    </header>
                    <pre>{command.aggregatedOutput || "No output yet."}</pre>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className={`panel panel--sessions${activeTab === "sessions" ? " panel--active" : ""}`}>
            <div className="panel__header">
              <h3>Projects</h3>
              <button className="secondary-button" type="button" onClick={() => onCreateSession(activeWorkspacePath)}>
                {`New in ${activeWorkspaceLabel}`}
              </button>
            </div>
            <div className="workspace-panel-list">
              {workspaceGroups.map((group) => (
                <WorkspaceGroupPanel
                  currentSessionId={currentSession?.id ?? null}
                  group={group}
                  key={`panel-${group.path}`}
                  onCreateSession={onCreateSession}
                  onImportHistory={onImportHistory}
                  onSelectSession={onSelectSession}
                  onSelectWorkspace={onSelectWorkspace}
                />
              ))}
              {!workspaceGroups.length ? (
                <div className="empty-state">
                  <div className="empty-state__content">
                    <p>No workspaces yet. Start a new one from here.</p>
                    <button className="primary-button" type="button" onClick={() => onCreateSession(activeWorkspacePath)}>
                      New session
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className={`panel panel--settings${activeTab === "settings" ? " panel--active" : ""}`}>
            <div className="panel__header">
              <h3>Settings</h3>
              <span>Single-user local config</span>
            </div>
            <div className="settings-form">
              <div className="settings-card">
                <div className="settings-card__header">
                  <strong>Quick deck</strong>
                  <span>Fast controls for plan mode, MCP feed and workspace switching.</span>
                </div>
                <div className="settings-card__grid">
                  <button className="secondary-button" type="button" onClick={() => void runQuickAction({ kind: "set-mode", mode: "plan" })}>
                    Plan mode
                  </button>
                  <button className="secondary-button" type="button" onClick={() => void runQuickAction({ kind: "open-tab", tab: "activity" })}>
                    MCP status
                  </button>
                  <button className="secondary-button" type="button" onClick={() => void runQuickAction({ kind: "open-tab", tab: "sessions" })}>
                    Workspace board
                  </button>
                </div>
              </div>
              <label className="field">
                <span>Workspace path</span>
                <input type="text" value={workspaceDraft} onChange={(event) => setWorkspaceDraft(event.target.value)} />
              </label>
              <div className="browser-actions">
                <button className="secondary-button" type="button" onClick={() => onBrowseWorkspace(workspaceDraft)}>
                  Browse folders
                </button>
                {workspaceBrowser?.parentPath ? (
                  <button className="secondary-button" type="button" onClick={() => onBrowseWorkspace(workspaceBrowser.parentPath ?? undefined)}>
                    Up
                  </button>
                ) : null}
              </div>
              {workspaceBrowser ? (
                <div className="workspace-browser">
                  <div className="workspace-browser__current">
                    <div>
                      <strong>Current folder</strong>
                      <span>{workspaceBrowser.currentPath}</span>
                    </div>
                    <button className="primary-button" type="button" onClick={() => setWorkspaceDraft(workspaceBrowser.currentPath)}>
                      Use current folder
                    </button>
                  </div>
                  <div className="workspace-browser__roots">
                    {workspaceBrowser.roots.map((root) => (
                      <button className="workspace-chip" key={root} type="button" onClick={() => onBrowseWorkspace(root)}>
                        {root}
                      </button>
                    ))}
                  </div>
                  <div className="workspace-browser__list">
                    {workspaceBrowser.entries.map((entry) => (
                      <article className="workspace-entry" key={entry.path}>
                        <div className="workspace-entry__meta">
                          <strong>{entry.name}</strong>
                          <span>{entry.path}</span>
                        </div>
                        <div className="workspace-entry__actions">
                          <button className="secondary-button" type="button" onClick={() => onBrowseWorkspace(entry.path)}>
                            Open
                          </button>
                          <button className="primary-button" type="button" onClick={() => setWorkspaceDraft(entry.path)}>
                            Choose
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
              <label className="field">
                <span>Default mode</span>
                <select
                  value={defaultModeDraft}
                  onChange={(event) => setDefaultModeDraft(event.target.value as SettingsResponse["defaultMode"])}
                >
                  <option value="default">default</option>
                  <option value="plan">structured preset</option>
                </select>
              </label>
              <button
                className="primary-button"
                type="button"
                onClick={() => onSaveSettings({ workspacePath: workspaceDraft, defaultMode: defaultModeDraft })}
              >
                Save settings
              </button>
              <button className="secondary-button" type="button" onClick={() => void onLogout()}>
                Lock console
              </button>
            </div>
          </section>
        </div>

        <nav className="mobile-nav" aria-label="Primary">
          {(["chat", "activity", "sessions", "settings"] as ShellTab[]).map((tab) => (
            <button
              className={activeTab === tab ? "mobile-nav__button mobile-nav__button--active" : "mobile-nav__button"}
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
            >
              {labelForTab(tab)}
            </button>
          ))}
        </nav>
      </main>
    </div>
  );
}

function WorkspaceGroupCard({
  group,
  currentSessionId,
  onCreateSession,
  onSelectWorkspace,
  onSelectSession,
  onImportHistory,
}: {
  group: WorkspaceGroup;
  currentSessionId: string | null;
  onCreateSession: (workspacePath?: string) => void;
  onSelectWorkspace: (workspacePath: string) => void;
  onSelectSession: (sessionId: string) => void;
  onImportHistory: (threadId: string, historyPath: string) => void;
}) {
  return (
    <article className={`workspace-group${group.selected ? " workspace-group--selected" : ""}`}>
      <div className="workspace-group__header">
        <button
          aria-label={`${group.label} workspace`}
          className="workspace-group__title"
          type="button"
          onClick={() => onSelectWorkspace(group.path)}
        >
          <strong>{group.label}</strong>
          <span>{group.path}</span>
        </button>
        <button aria-label={`New in ${group.label}`} className="secondary-button" type="button" onClick={() => onCreateSession(group.path)}>
          {`New in ${group.label}`}
        </button>
      </div>
      <div className="workspace-group__items">
        {group.sessions.map((session) => (
          <button
            className={`workspace-item${currentSessionId === session.id ? " workspace-item--active" : ""}`}
            key={session.id}
            type="button"
            onClick={() => onSelectSession(session.id)}
          >
            <strong>{compactSessionTitle(session.title)}</strong>
            <span>{session.status}</span>
          </button>
        ))}
        {group.history.map((entry) => (
          <button
            className="workspace-item workspace-item--history"
            key={entry.threadId}
            type="button"
            onClick={() => onImportHistory(entry.threadId, entry.path)}
          >
            <strong>{compactSessionTitle(entry.preview)}</strong>
            <span>history</span>
          </button>
        ))}
      </div>
    </article>
  );
}

function WorkspaceGroupPanel({
  group,
  currentSessionId,
  onCreateSession,
  onSelectWorkspace,
  onSelectSession,
  onImportHistory,
}: {
  group: WorkspaceGroup;
  currentSessionId: string | null;
  onCreateSession: (workspacePath?: string) => void;
  onSelectWorkspace: (workspacePath: string) => void;
  onSelectSession: (sessionId: string) => void;
  onImportHistory: (threadId: string, historyPath: string) => void;
}) {
  return (
    <section className={`workspace-panel${group.selected ? " workspace-panel--selected" : ""}`}>
      <div className="workspace-panel__header">
        <button
          aria-label={`${group.label} workspace`}
          className="workspace-panel__title"
          type="button"
          onClick={() => onSelectWorkspace(group.path)}
        >
          <strong>{group.label}</strong>
          <span>{group.path}</span>
        </button>
        <button aria-label={`New in ${group.label}`} className="secondary-button" type="button" onClick={() => onCreateSession(group.path)}>
          {`New in ${group.label}`}
        </button>
      </div>
      <div className="session-stack">
        {group.sessions.map((session) => (
          <button
            className={`session-tile${currentSessionId === session.id ? " session-tile--active" : ""}`}
            key={session.id}
            type="button"
            onClick={() => onSelectSession(session.id)}
          >
            <div>
              <strong>{compactSessionTitle(session.title)}</strong>
              <span>{session.cwd}</span>
            </div>
            <span>{session.mode === "plan" ? "structured" : "default"}</span>
          </button>
        ))}
        {group.history.map((entry) => (
          <button className="session-tile" key={`history-${entry.threadId}`} type="button" onClick={() => onImportHistory(entry.threadId, entry.path)}>
            <div>
              <strong>{compactSessionTitle(entry.preview)}</strong>
              <span>{entry.cwd}</span>
            </div>
            <span>import</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function MessageBubble({ message }: { message: SessionMessage }) {
  return (
    <article
      className={`message-bubble message-bubble--${message.role}${message.state === "streaming" ? " message-bubble--streaming" : ""}`}
    >
      <header>
        <strong>{message.role === "assistant" ? "Codex" : "You"}</strong>
        <span>{message.state === "streaming" ? "streaming" : "final"}</span>
      </header>
      <p>{message.text}</p>
    </article>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  switch (item.type) {
    case "status_update":
      return (
        <article className="activity-row">
          <strong>Status</strong>
          <span>{item.status}</span>
          {item.detail ? <p>{item.detail}</p> : null}
        </article>
      );
    case "command":
      return (
        <article className="activity-row">
          <strong>Command</strong>
          <span>{item.status}</span>
          <p>{item.command}</p>
        </article>
      );
    case "tool":
      return (
        <article className="activity-row">
          <strong>Tool</strong>
          <span>{item.status}</span>
          <p>{item.label}</p>
        </article>
      );
    case "plan":
      return (
        <article className="activity-row">
          <strong>Plan</strong>
          <span>updated</span>
          <p>{item.detail}</p>
        </article>
      );
  }
}

function labelForTab(tab: ShellTab): string {
  switch (tab) {
    case "chat":
      return "Chat";
    case "activity":
      return "Activity";
    case "sessions":
      return "Sessions";
    case "settings":
      return "Settings";
  }
}

function compactSessionTitle(title: string): string {
  if (
    title === "Р СњР С•Р Р†Р В°РЎРЏ РЎРѓР ВµРЎРѓРЎРѓР С‘РЎРЏ" ||
    title === "РќРѕРІР°СЏ СЃРµСЃСЃРёСЏ" ||
    title === "Новая сессия"
  ) {
    return "Session draft";
  }

  return title;
}

function getSlashQuery(draft: string): string | null {
  const trimmed = draft.trimStart();
  return trimmed.startsWith("/") ? trimmed.slice(1).trim() : null;
}

function formatWorkspaceLabel(workspacePath: string): string {
  const normalized = workspacePath.replace(/[\\/]+$/, "");
  const segments = normalized.split(/[/\\]+/).filter(Boolean);
  return segments.at(-1) ?? workspacePath;
}

function buildWorkspaceGroups({
  sessions,
  historyEntries,
  selectedWorkspacePath,
  defaultWorkspacePath,
  currentWorkspacePath,
}: {
  sessions: SessionRecord[];
  historyEntries: CodexHistoryEntry[];
  selectedWorkspacePath: string;
  defaultWorkspacePath: string;
  currentWorkspacePath?: string;
}): WorkspaceGroup[] {
  const groups = new Map<string, WorkspaceGroup>();
  for (const workspacePath of [
    defaultWorkspacePath,
    selectedWorkspacePath,
    currentWorkspacePath,
    ...sessions.map((session) => session.cwd),
    ...historyEntries.map((entry) => entry.cwd),
  ].filter(Boolean) as string[]) {
    if (!groups.has(workspacePath)) {
      groups.set(workspacePath, {
        path: workspacePath,
        label: formatWorkspaceLabel(workspacePath),
        sessions: [],
        history: [],
        lastTouchedAt: 0,
        selected: workspacePath === selectedWorkspacePath,
      });
    }
  }

  for (const session of sessions) {
    const group = groups.get(session.cwd);
    if (group) {
      group.sessions.push(session);
      group.lastTouchedAt = Math.max(group.lastTouchedAt, session.updatedAt);
    }
  }

  for (const entry of historyEntries) {
    const group = groups.get(entry.cwd);
    if (group && !group.sessions.some((session) => session.threadId === entry.threadId)) {
      group.history.push(entry);
      group.lastTouchedAt = Math.max(group.lastTouchedAt, entry.updatedAt);
    }
  }

  for (const group of groups.values()) {
    group.sessions.sort((left, right) => right.updatedAt - left.updatedAt);
    group.history.sort((left, right) => right.updatedAt - left.updatedAt);
  }

  return [...groups.values()].sort((left, right) => {
    if (left.selected && !right.selected) {
      return -1;
    }
    if (!left.selected && right.selected) {
      return 1;
    }
    return right.lastTouchedAt - left.lastTouchedAt || left.label.localeCompare(right.label);
  });
}

function buildQuickActions(
  currentSession: SessionRecord | null,
  activeWorkspacePath: string,
  workspaceGroups: WorkspaceGroup[],
): QuickActionOption[] {
  const actions: QuickActionOption[] = [
    {
      id: "mode-plan",
      label: "Plan mode",
      description:
        currentSession?.mode === "plan"
          ? "Already enabled for the current session."
          : "Reply in planning mode with a structured proposed plan.",
      action: { kind: "set-mode", mode: "plan" },
    },
    {
      id: "mode-default",
      label: "Default mode",
      description:
        currentSession?.mode === "default" || !currentSession
          ? "Use the standard implementation flow."
          : "Switch the active session back to implementation mode.",
      action: { kind: "set-mode", mode: "default" },
    },
    {
      id: "tab-activity",
      label: "MCP status",
      description: "Open the live activity feed with commands and tool calls.",
      action: { kind: "open-tab", tab: "activity" },
    },
    {
      id: "tab-sessions",
      label: "Workspace board",
      description: "Open grouped sessions and history by project workspace.",
      action: { kind: "open-tab", tab: "sessions" },
    },
    {
      id: "tab-settings",
      label: "Settings",
      description: "Open the local device configuration panel.",
      action: { kind: "open-tab", tab: "settings" },
    },
    {
      id: `create-${activeWorkspacePath}`,
      label: `New in ${formatWorkspaceLabel(activeWorkspacePath)}`,
      description: `Start a fresh session inside ${activeWorkspacePath}.`,
      action: { kind: "create-session", workspacePath: activeWorkspacePath },
    },
  ];

  for (const group of workspaceGroups) {
    actions.push({
      id: `workspace-${group.path}`,
      label: `${group.label} workspace`,
      description: group.path,
      action: { kind: "select-workspace", workspacePath: group.path },
    });
  }

  return actions;
}
