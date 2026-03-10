import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import portalShieldLogo from "../assets/portal-shield-logo.svg";

import type {
  ActivityItem,
  ApprovalPolicy,
  CodexHistoryEntry,
  ComposerAttachment,
  McpServerStatus,
  ModelOption,
  ReasoningEffort,
  SessionMessage,
  SessionRecord,
  SettingsResponse,
  SpeedPreset,
  UpdateSessionPreferencesRequest,
  UpdateSettingsRequest,
  WorkspaceBrowserResponse,
} from "../../shared/contracts";

export type ShellTab = "chat" | "activity" | "sessions" | "settings";
export type ShellAuthState = "setup" | "login" | "ready" | "busy";
export type ShellQuickAction =
  | { kind: "set-mode"; mode: "default" | "plan" }
  | { kind: "set-speed"; speed: SpeedPreset }
  | { kind: "set-approval"; approvalPolicy: ApprovalPolicy }
  | { kind: "set-reasoning"; reasoningEffort: ReasoningEffort | null }
  | { kind: "set-model"; model: string | null }
  | { kind: "open-tab"; tab: ShellTab }
  | { kind: "select-workspace"; workspacePath: string }
  | { kind: "create-session"; workspacePath: string }
  | { kind: "fork-session" };

interface AppShellProps {
  authenticated: boolean;
  currentSession: SessionRecord | null;
  sessions: SessionRecord[];
  selectedWorkspacePath: string;
  activeTab: ShellTab;
  onTabChange: (tab: ShellTab) => void;
  onCreateSession: (workspacePath?: string) => void;
  onForkSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onSelectWorkspace: (workspacePath: string) => void;
  onSendMessage: () => void;
  onToggleMode: (checked: boolean) => void;
  onUpdatePreferences: (payload: UpdateSessionPreferencesRequest) => Promise<void> | void;
  onResolveApproval: (
    requestId: string,
    decision: "accept" | "acceptForSession" | "decline" | "cancel",
    applyExecPolicyAmendment?: boolean,
  ) => Promise<void> | void;
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
  modelOptions: ModelOption[];
  mcpStatus: McpServerStatus[];
  authState: ShellAuthState;
  sessionDraft: string;
  composerAttachments: ComposerAttachment[];
  onDraftChange: (value: string) => void;
  onAddAttachments: (attachments: ComposerAttachment[]) => void;
  onRemoveAttachment: (index: number) => void;
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

type ConversationTimelineItem =
  | { key: string; createdAt: number; kind: "message"; message: SessionMessage }
  | { key: string; createdAt: number; kind: "activity"; activity: ActivityItem }
  | {
    key: string;
    createdAt: number;
    kind: "command";
    command: SessionRecord["commands"][number];
  }
  | {
    key: string;
    createdAt: number;
    kind: "approval";
    approval: SessionRecord["approvals"][number];
  }
  | { key: string; createdAt: number; kind: "plan"; plan: SessionRecord["planBlocks"][number] };

export function AppShell({
  authenticated,
  currentSession,
  sessions,
  selectedWorkspacePath,
  activeTab,
  onTabChange,
  onCreateSession,
  onForkSession,
  onSelectSession,
  onSelectWorkspace,
  onSendMessage,
  onToggleMode,
  onUpdatePreferences,
  onResolveApproval,
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
  modelOptions,
  mcpStatus,
  authState,
  sessionDraft,
  composerAttachments,
  onDraftChange,
  onAddAttachments,
  onRemoveAttachment,
  error = null,
  onDismissError,
}: AppShellProps) {
  const [pin, setPin] = useState("");
  const [workspaceDraft, setWorkspaceDraft] = useState(settings.workspacePath);
  const [defaultModeDraft, setDefaultModeDraft] = useState(settings.defaultMode);
  const [defaultModelDraft, setDefaultModelDraft] = useState(settings.defaultModel ?? "");
  const [defaultReasoningDraft, setDefaultReasoningDraft] = useState(
    settings.defaultReasoningEffort ?? "",
  );
  const [defaultApprovalDraft, setDefaultApprovalDraft] = useState(
    settings.defaultApprovalPolicy,
  );
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setWorkspaceDraft(settings.workspacePath);
    setDefaultModeDraft(settings.defaultMode);
    setDefaultModelDraft(settings.defaultModel ?? "");
    setDefaultReasoningDraft(settings.defaultReasoningEffort ?? "");
    setDefaultApprovalDraft(settings.defaultApprovalPolicy);
  }, [
    settings.defaultApprovalPolicy,
    settings.defaultMode,
    settings.defaultModel,
    settings.defaultReasoningEffort,
    settings.workspacePath,
  ]);

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
  const desktopInspectorTab = activeTab === "chat" ? null : activeTab;
  const visibleActivity = currentSession?.activity ?? [];
  const pendingApprovals = currentSession?.approvals.filter((item) => item.status === "pending") ?? [];
  const slashQuery = getSlashQuery(sessionDraft);
  const currentSpeed = speedPresetFromReasoning(currentSession?.preferences.reasoningEffort ?? null);
  const conversationFeed = useMemo(
    () => buildConversationFeed(currentSession),
    [currentSession],
  );
  const quickActions = useMemo(
    () =>
      buildQuickActions(
        currentSession,
        activeWorkspacePath,
        workspaceGroups,
        currentSpeed,
        modelOptions,
      ),
    [activeWorkspacePath, currentSession, currentSpeed, modelOptions, workspaceGroups],
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

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }

    if (typeof container.scrollTo === "function") {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [currentSession?.id, currentSession?.messages, pendingApprovals.length]);

  async function runQuickAction(action: ShellQuickAction): Promise<void> {
    await onQuickAction(action);
    setQuickMenuOpen(false);
    onDraftChange("");
  }

  async function handleFilePick(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = [...(event.target.files ?? [])];
    if (!files.length) {
      return;
    }

    const attachments = await Promise.all(files.map(fileToAttachment));
    onAddAttachments(attachments);
    event.target.value = "";
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
      !event.shiftKey &&
      slashQuery === null &&
      currentSession &&
      (sessionDraft.trim() || composerAttachments.length)
    ) {
      event.preventDefault();
      onSendMessage();
    }
  }

  if (!authenticated) {
    return (
      <div className="shell shell--auth">
        <div className="auth-card">
          <img alt="Portal VPN shield" className="app-logo" src={portalShieldLogo} />
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
          <div className="promo-banner">
            <div className="promo-banner__shield">🛡️</div>
            <div className="promo-banner__content">
              <strong>Защити своё соединение</strong>
              <span>USA-локации · Безлимит · Бесплатно</span>
            </div>
            <a className="promo-banner__cta" href="https://t.me/portal_service_bot" target="_blank" rel="noopener noreferrer">
              Подключить ⚡
            </a>
          </div>
          <div className="promo-links">
            <a href="https://t.me/seeallochnaya" target="_blank" rel="noopener noreferrer">
              📢 Сиолошная
            </a>
            <span>·</span>
            <a href="https://t.me/portal_service_bot" target="_blank" rel="noopener noreferrer">
              🚀 Portal VPN
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="primary-nav" aria-label="Primary">
        <div className="primary-nav__top">
          <button className="primary-nav__brand" type="button" onClick={() => onTabChange("chat")}>
            <img alt="Portal VPN shield" className="primary-nav__logo" src={portalShieldLogo} />
          </button>
          <button
            aria-label="New session"
            className="primary-nav__button"
            type="button"
            onClick={() => onCreateSession(activeWorkspacePath)}
          >
            +
          </button>
          <button
            aria-label="Chat tab"
            className={activeTab === "chat" ? "primary-nav__button primary-nav__button--active" : "primary-nav__button"}
            type="button"
            onClick={() => onTabChange("chat")}
          >
            <span className="primary-nav__glyph primary-nav__glyph--chat" />
          </button>
          <button
            aria-label="Activity tab"
            className={activeTab === "activity" ? "primary-nav__button primary-nav__button--active" : "primary-nav__button"}
            type="button"
            onClick={() => onTabChange("activity")}
          >
            <span className="primary-nav__glyph primary-nav__glyph--activity" />
          </button>
          <button
            aria-label="Sessions tab"
            className={activeTab === "sessions" ? "primary-nav__button primary-nav__button--active" : "primary-nav__button"}
            type="button"
            onClick={() => onTabChange("sessions")}
          >
            <span className="primary-nav__glyph primary-nav__glyph--sessions" />
          </button>
        </div>
        <button
          aria-label="Settings tab"
          className={activeTab === "settings" ? "primary-nav__button primary-nav__button--active" : "primary-nav__button"}
          type="button"
          onClick={() => onTabChange("settings")}
        >
          <span className="primary-nav__glyph primary-nav__glyph--settings" />
        </button>
        <a className="primary-nav__promo" href="https://t.me/sioloshna" target="_blank" rel="noopener noreferrer" title="Сиолошная">
          <span className="primary-nav__glyph primary-nav__glyph--tg" />
        </a>
      </aside>
      <aside className="rail">
        <div className="rail__header">
          <div>
            <div className="hero-badge">Codex</div>
            <h1>Conversations</h1>
          </div>
          <button className="secondary-button" type="button" onClick={() => onCreateSession(activeWorkspacePath)}>
            New
          </button>
        </div>
        <section className="rail__section rail__section--shortcuts">
          <button className="rail-link" type="button" onClick={() => onCreateSession(activeWorkspacePath)}>
            <span className="rail-link__icon">+</span>
            <span>New conversation</span>
          </button>
          <button className="rail-link" type="button" onClick={() => onTabChange("settings")}>
            <span className="rail-link__icon">/</span>
            <span>Commands & settings</span>
          </button>
          <button className="rail-link" type="button" onClick={() => onTabChange("activity")}>
            <span className="rail-link__icon">&gt;</span>
            <span>Terminal & activity</span>
          </button>
        </section>
        <section className="rail__section rail__section--projects">
          <div className="section-heading">
            <span>Projects</span>
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
        <div className="rail__footer">
          <button className="rail-link rail-link--footer" type="button" onClick={() => onTabChange("settings")}>
            <span className="rail-link__icon">o</span>
            <span>Settings</span>
          </button>
        </div>
      </aside>

      <main className="console">
        <header className="console__header">
          <div>
            <p className="eyebrow">{currentSession ? "Thread" : "Workspace"}</p>
            <h2>{currentSession ? compactSessionTitle(currentSession.title) : "New thread"}</h2>
            <p className="console__path">{currentSession ? activeWorkspaceLabel : activeWorkspacePath}</p>
            <div className="console__meta">
              <span className={`status-pill status-pill--${currentSession?.status ?? "idle"}`}>
                {currentSession?.status ?? "ready"}
              </span>
              <span className="meta-pill">{activeWorkspaceLabel}</span>
              <span className="meta-pill">{`${workspaceGroups.length} workspaces`}</span>
            </div>
          </div>
          <div className="console__actions">
            <button className="secondary-button" type="button" onClick={() => onCreateSession(activeWorkspacePath)}>
              New
            </button>
            {currentSession ? (
              <button className="secondary-button" type="button" onClick={onForkSession}>
                Fork session
              </button>
            ) : null}
            <div className="quick-menu-shell">
              <button
                aria-expanded={quickMenuOpen}
                className="secondary-button"
                type="button"
                onClick={() => setQuickMenuOpen((current) => !current)}
              >
                /
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
              <span>Plan</span>
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

        <div className={`workspace${desktopInspectorTab ? " workspace--with-inspector" : ""}`}>
          <section className={`panel panel--chat${activeTab === "chat" ? " panel--active" : ""}`}>
            <div className="panel__header">
              <h3>Chat</h3>
              <span>{currentSession ? currentSession.cwd : activeWorkspacePath}</span>
            </div>
            <div className="message-list" ref={messageListRef}>
              {conversationFeed.map((item) => (
                <ConversationFeedItem
                  item={item}
                  key={item.key}
                  onResolveApproval={onResolveApproval}
                />
              ))}
              {currentSession && (currentSession.status === "running" || currentSession.status === "waiting") ? (
                <div className="typing-indicator">
                  <div className="typing-indicator__dots">
                    <span />
                    <span />
                    <span />
                  </div>
                  {currentSession.status === "waiting" ? "Waiting for approval..." : "Codex is thinking..."}
                </div>
              ) : null}
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
                placeholder="Ask Codex anything, @ to add files, / for commands"
                value={sessionDraft}
                onKeyDown={handleComposerKeyDown}
                onChange={(event) => onDraftChange(event.target.value)}
              />
              {composerAttachments.length ? (
                <div className="attachment-list">
                  {composerAttachments.map((attachment, index) => (
                    <article
                      className="attachment-chip"
                      key={`${attachment.name}-${attachment.size}-${index}`}
                    >
                      <div>
                        <strong>{attachment.name}</strong>
                        <span>{formatBytes(attachment.size)}</span>
                      </div>
                      <button
                        aria-label={`Remove ${attachment.name}`}
                        type="button"
                        onClick={() => onRemoveAttachment(index)}
                      >
                        Remove
                      </button>
                    </article>
                  ))}
                </div>
              ) : null}
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
                <div className="composer__actions">
                  <input
                    hidden
                    multiple
                    ref={fileInputRef}
                    type="file"
                    onChange={(event) => void handleFilePick(event)}
                  />
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Attach
                  </button>
                  <button
                    className="primary-button"
                    disabled={
                      !currentSession ||
                      (!sessionDraft.trim() && composerAttachments.length === 0) ||
                      slashQuery !== null
                    }
                    type="button"
                    onClick={onSendMessage}
                  >
                    Send
                  </button>
                </div>
                <span className="composer__hint">
                  {`/ commands · Enter to send · ${activeWorkspaceLabel}`}
                </span>
              </div>
              <div className="composer__mode-tabs">
                <button
                  className={currentSession?.mode !== "plan" ? "composer__mode-tab composer__mode-tab--active" : "composer__mode-tab"}
                  disabled={!currentSession}
                  type="button"
                  onClick={() => onToggleMode(false)}
                >
                  Local
                </button>
                <button
                  className={currentSession?.mode === "plan" ? "composer__mode-tab composer__mode-tab--active" : "composer__mode-tab"}
                  disabled={!currentSession}
                  type="button"
                  onClick={() => onToggleMode(true)}
                >
                  Worktree
                </button>
              </div>
            </div>
          </section>

          <section className={`panel panel--activity${activeTab === "activity" ? " panel--active" : ""}`}>
            <div className="panel__header">
              <h3>Activity</h3>
              <span>{visibleActivity.length}</span>
            </div>
            <div className="mcp-grid">
              {mcpStatus.length ? (
                mcpStatus.map((server) => (
                  <article className="mcp-card" key={server.name}>
                    <header>
                      <strong>{server.name}</strong>
                      <span>{server.authStatus}</span>
                    </header>
                    <p>{`${server.toolCount} tools · ${server.resourceCount} resources · ${server.resourceTemplateCount} templates`}</p>
                    {server.toolNames.length ? (
                      <div className="token-list">
                        {server.toolNames.map((tool) => (
                          <span className="token-chip" key={`${server.name}-tool-${tool}`}>
                            {tool}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {server.resourceNames.length ? (
                      <div className="token-list">
                        {server.resourceNames.map((resource) => (
                          <span className="token-chip token-chip--muted" key={`${server.name}-resource-${resource}`}>
                            {resource}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {server.resourceTemplateNames.length ? (
                      <div className="token-list">
                        {server.resourceTemplateNames.map((template) => (
                          <span className="token-chip token-chip--muted" key={`${server.name}-template-${template}`}>
                            {template}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="empty-inline">Open a session to load MCP server status.</div>
              )}
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
              <h3>Sessions</h3>
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
                  <strong>Session controls</strong>
                  <span>Model, speed, reasoning and approval for the current thread.</span>
                </div>
                {currentSession ? (
                  <div className="settings-card__stack">
                    <label className="field">
                      <span>Model</span>
                      <select
                        value={currentSession.preferences.model ?? ""}
                        onChange={(event) =>
                          void onUpdatePreferences({ model: event.target.value || null })
                        }
                      >
                        <option value="">session default</option>
                        {modelOptions.map((model) => (
                          <option key={model.id} value={model.model}>
                            {model.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="segment-row">
                      {(["fast", "balanced", "deep"] as SpeedPreset[]).map((speed) => (
                        <button
                          className={
                            currentSpeed === speed
                              ? "secondary-button segment-button segment-button--active"
                              : "secondary-button segment-button"
                          }
                          key={speed}
                          type="button"
                          onClick={() => void onQuickAction({ kind: "set-speed", speed })}
                        >
                          {speed}
                        </button>
                      ))}
                    </div>
                    <label className="field">
                      <span>Reasoning effort</span>
                      <select
                        value={currentSession.preferences.reasoningEffort ?? ""}
                        onChange={(event) =>
                          void onUpdatePreferences({
                            reasoningEffort: (event.target.value || null) as ReasoningEffort | null,
                          })
                        }
                      >
                        <option value="">session default</option>
                        {collectReasoningOptions(modelOptions, currentSession.preferences.model).map(
                          (effort) => (
                            <option key={effort} value={effort}>
                              {effort}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="field">
                      <span>Approval policy</span>
                      <select
                        value={currentSession.preferences.approvalPolicy}
                        onChange={(event) =>
                          void onUpdatePreferences({
                            approvalPolicy: event.target.value as ApprovalPolicy,
                          })
                        }
                      >
                        <option value="never">never</option>
                        <option value="on-request">on-request</option>
                        <option value="untrusted">untrusted</option>
                        <option value="on-failure">on-failure</option>
                      </select>
                    </label>
                  </div>
                ) : (
                  <div className="empty-inline">Create or open a session to configure live controls.</div>
                )}
              </div>
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
              <label className="field">
                <span>Default model</span>
                <select
                  value={defaultModelDraft}
                  onChange={(event) => setDefaultModelDraft(event.target.value)}
                >
                  <option value="">session default</option>
                  {modelOptions.map((model) => (
                    <option key={model.id} value={model.model}>
                      {model.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Default reasoning</span>
                <select
                  value={defaultReasoningDraft}
                  onChange={(event) => setDefaultReasoningDraft(event.target.value)}
                >
                  <option value="">balanced</option>
                  {collectReasoningOptions(modelOptions, defaultModelDraft || null).map((effort) => (
                    <option key={effort} value={effort}>
                      {effort}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Default approval</span>
                <select
                  value={defaultApprovalDraft}
                  onChange={(event) => setDefaultApprovalDraft(event.target.value as ApprovalPolicy)}
                >
                  <option value="never">never</option>
                  <option value="on-request">on-request</option>
                  <option value="untrusted">untrusted</option>
                  <option value="on-failure">on-failure</option>
                </select>
              </label>
              <button
                className="primary-button"
                type="button"
                onClick={() =>
                  onSaveSettings({
                    workspacePath: workspaceDraft,
                    defaultMode: defaultModeDraft,
                    defaultModel: defaultModelDraft || null,
                    defaultReasoningEffort: (defaultReasoningDraft || null) as ReasoningEffort | null,
                    defaultApprovalPolicy: defaultApprovalDraft,
                  })
                }
              >
                Save settings
              </button>
              <button className="secondary-button" type="button" onClick={() => void onLogout()}>
                Lock console
              </button>
              <div className="settings-card">
                <div className="settings-card__header">
                  <strong>Network access</strong>
                  <span>Use these URLs on desktop, phone or static IP routing.</span>
                </div>
                <div className="listen-grid">
                  {settings.listenUrls.map((listenUrl) => (
                    <div className="listen-card" key={listenUrl.url}>
                      <span>{listenUrl.label}</span>
                      <strong>{listenUrl.url}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="settings-card">
                <article className="vpn-widget">
                  <div className="vpn-widget__header">
                    <img alt="Portal VPN shield" className="vpn-widget__logo" src={portalShieldLogo} />
                    <div>
                      <strong>Professional connection shield</strong>
                      <span>USA-ready VPN for AI tools</span>
                    </div>
                  </div>
                  <ul className="vpn-widget__list">
                    <li>Encrypts all traffic</li>
                    <li>Keeps browsing more anonymous</li>
                    <li>USA locations so AI services work normally</li>
                    <li>FREE tier stays unlimited</li>
                  </ul>
                  <a
                    className="primary-button vpn-widget__cta"
                    href="https://t.me/portal_service_bot"
                    rel="noreferrer"
                    target="_blank"
                  >
                    Connect free USA VPN
                  </a>
                </article>
              </div>
            </div>
          </section>
        </div>

        <footer className="status-bar">
          <div className="status-bar__group">
            <button className="status-bar__chip" type="button" onClick={() => onTabChange("chat")}>
              Local
            </button>
            <button className="status-bar__chip" type="button" onClick={() => onTabChange("activity")}>
              Terminal
            </button>
            <span className="status-bar__chip">{currentSession?.preferences.model ?? "GPT-5.4"}</span>
            <span className="status-bar__chip">{currentSpeed}</span>
          </div>
          <div className="status-bar__group">
            <span className="status-bar__chip">{formatApprovalLabel(currentSession?.preferences.approvalPolicy ?? settings.defaultApprovalPolicy)}</span>
            <span className="status-bar__chip">{activeWorkspaceLabel}</span>
            <span className="status-bar__chip">master</span>
          </div>
        </footer>

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

function ApprovalCard({
  approval,
  onResolve,
}: {
  approval: SessionRecord["approvals"][number];
  onResolve: (
    requestId: string,
    decision: "accept" | "acceptForSession" | "decline" | "cancel",
    applyExecPolicyAmendment?: boolean,
  ) => Promise<void> | void;
}) {
  return (
    <article className="approval-card">
      <header>
        <strong>{approval.kind === "command" ? "Approval required" : "File change approval"}</strong>
        <span>{approval.kind}</span>
      </header>
      {approval.command ? <p>{approval.command}</p> : null}
      {approval.reason ? <p>{approval.reason}</p> : null}
      {approval.cwd ? <span>{approval.cwd}</span> : null}
      {approval.grantRoot ? <span>{approval.grantRoot}</span> : null}
      <div className="approval-card__actions">
        <button
          className="primary-button"
          type="button"
          onClick={() => void onResolve(approval.requestId, "accept")}
        >
          Accept
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void onResolve(approval.requestId, "acceptForSession")}
        >
          Accept for session
        </button>
        {approval.kind === "command" && approval.proposedExecpolicyAmendment?.length ? (
          <button
            className="secondary-button"
            type="button"
            onClick={() => void onResolve(approval.requestId, "accept", true)}
          >
            Accept + policy
          </button>
        ) : null}
        <button
          className="secondary-button"
          type="button"
          onClick={() => void onResolve(approval.requestId, "decline")}
        >
          Decline
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void onResolve(approval.requestId, "cancel")}
        >
          Cancel turn
        </button>
      </div>
    </article>
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
          <small>{`${group.sessions.length} live · ${group.history.length} synced`}</small>
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
            <div className="workspace-item__row">
              <strong>{compactSessionTitle(session.title)}</strong>
              <span>{formatRelativeTime(session.updatedAt)}</span>
            </div>
            <span>{session.mode === "plan" ? "structured" : session.status}</span>
          </button>
        ))}
        {group.history.map((entry) => (
          <button
            className="workspace-item workspace-item--history"
            key={entry.threadId}
            type="button"
            onClick={() => onImportHistory(entry.threadId, entry.path)}
          >
            <div className="workspace-item__row">
              <strong>{compactSessionTitle(entry.preview)}</strong>
              <span>{formatRelativeTime(entry.updatedAt)}</span>
            </div>
            <span>synced history</span>
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
          <small>{`${group.sessions.length} live · ${group.history.length} synced`}</small>
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
            <span>open</span>
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

function ConversationFeedItem({
  item,
  onResolveApproval,
}: {
  item: ConversationTimelineItem;
  onResolveApproval: (
    requestId: string,
    decision: "accept" | "acceptForSession" | "decline" | "cancel",
    applyExecPolicyAmendment?: boolean,
  ) => Promise<void> | void;
}) {
  switch (item.kind) {
    case "message":
      return <MessageBubble message={item.message} />;
    case "activity":
      return <ActivityRow item={item.activity} />;
    case "command":
      return (
        <article className="log-card log-card--inline">
          <header>
            <strong>{item.command.command}</strong>
            <span>{item.command.status}</span>
          </header>
          <pre>{item.command.aggregatedOutput || "No output yet."}</pre>
        </article>
      );
    case "approval":
      return (
        <ApprovalCard approval={item.approval} onResolve={onResolveApproval} />
      );
    case "plan":
      return (
        <article className="activity-row activity-row--plan">
          <strong>Plan block</strong>
          <span>structured</span>
          <p>{item.plan.text}</p>
        </article>
      );
  }
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

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) {
    return "now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
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

function buildConversationFeed(session: SessionRecord | null): ConversationTimelineItem[] {
  if (!session) {
    return [];
  }

  const feed: ConversationTimelineItem[] = [];

  for (const message of session.messages) {
    feed.push({
      key: `message-${message.itemId}`,
      createdAt: message.createdAt,
      kind: "message",
      message,
    });
  }

  for (const activity of session.activity) {
    if (activity.type === "command" || activity.type === "plan") {
      continue;
    }

    feed.push({
      key: `activity-${activity.id}`,
      createdAt: activity.createdAt,
      kind: "activity",
      activity,
    });
  }

  for (const command of session.commands) {
    feed.push({
      key: `command-${command.itemId}`,
      createdAt: command.createdAt,
      kind: "command",
      command,
    });
  }

  for (const approval of session.approvals) {
    feed.push({
      key: `approval-${approval.id}`,
      createdAt: approval.createdAt,
      kind: "approval",
      approval,
    });
  }

  for (const plan of session.planBlocks) {
    feed.push({
      key: `plan-${plan.itemId}`,
      createdAt: plan.createdAt,
      kind: "plan",
      plan,
    });
  }

  return feed.sort((left, right) => left.createdAt - right.createdAt || left.key.localeCompare(right.key));
}

function buildQuickActions(
  currentSession: SessionRecord | null,
  activeWorkspacePath: string,
  workspaceGroups: WorkspaceGroup[],
  currentSpeed: SpeedPreset,
  modelOptions: ModelOption[],
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
      id: "speed-fast",
      label: "Speed fast",
      description:
        currentSpeed === "fast"
          ? "Current session is optimized for quick turns."
          : "Prefer faster turns with lighter reasoning.",
      action: { kind: "set-speed", speed: "fast" },
    },
    {
      id: "speed-balanced",
      label: "Speed balanced",
      description:
        currentSpeed === "balanced"
          ? "Current session uses balanced reasoning."
          : "Use the default balance between speed and depth.",
      action: { kind: "set-speed", speed: "balanced" },
    },
    {
      id: "speed-deep",
      label: "Speed deep",
      description:
        currentSpeed === "deep"
          ? "Current session is already in deep mode."
          : "Spend more reasoning budget on harder turns.",
      action: { kind: "set-speed", speed: "deep" },
    },
    {
      id: "approval-on-request",
      label: "Approval on-request",
      description: "Let Codex ask before risky commands and edits.",
      action: { kind: "set-approval", approvalPolicy: "on-request" },
    },
    {
      id: "approval-never",
      label: "Approval never",
      description: "Keep the current fully automatic flow.",
      action: { kind: "set-approval", approvalPolicy: "never" },
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

  if (currentSession) {
    actions.push({
      id: `fork-${currentSession.id}`,
      label: "Fork session",
      description: "Branch the current thread into a new working copy.",
      action: { kind: "fork-session" },
    });
  }

  for (const model of modelOptions.slice(0, 5)) {
    actions.push({
      id: `model-${model.id}`,
      label: `Model ${model.displayName}`,
      description: model.description,
      action: { kind: "set-model", model: model.model },
    });
  }

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

function speedPresetFromReasoning(reasoningEffort: ReasoningEffort | null): SpeedPreset {
  switch (reasoningEffort) {
    case "none":
    case "minimal":
    case "low":
      return "fast";
    case "high":
    case "xhigh":
      return "deep";
    default:
      return "balanced";
  }
}

function collectReasoningOptions(
  modelOptions: ModelOption[],
  model: string | null,
): ReasoningEffort[] {
  const selected = modelOptions.find((entry) => entry.model === model);
  if (selected?.supportedReasoningEfforts.length) {
    return selected.supportedReasoningEfforts;
  }

  return ["minimal", "low", "medium", "high", "xhigh"];
}

function formatApprovalLabel(approvalPolicy: ApprovalPolicy): string {
  return approvalPolicy.replace("-", " ");
}

async function fileToAttachment(file: File): Promise<ComposerAttachment> {
  const buffer = await file.arrayBuffer();
  return {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    contentBase64: arrayBufferToBase64(buffer),
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 102.4) / 10} KB`;
  }
  return `${Math.round(bytes / 104857.6) / 10} MB`;
}
