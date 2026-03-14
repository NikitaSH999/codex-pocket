import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ApprovalRequest,
  BridgeConfigResponse,
  EventEnvelope,
  PairingResponse,
  SessionDetail,
  SessionSummary,
  WorkspaceSummary
} from "@codex-phone/shared";
import { formatRelativeTime, truncatePath } from "./utils.js";

type TabKey = "sessions" | "chat" | "approvals" | "workspaces";

const TOKEN_KEY = "codex-phone-token";
const DEVICE_KEY = "codex-phone-device";

const loadStoredToken = () => window.localStorage.getItem(TOKEN_KEY);
const loadStoredDevice = () => window.localStorage.getItem(DEVICE_KEY) ?? "My phone";

const api = async <T,>(path: string, token?: string | null, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

const App = () => {
  const [config, setConfig] = useState<BridgeConfigResponse | null>(null);
  const [token, setToken] = useState<string | null>(() => loadStoredToken());
  const [deviceName, setDeviceName] = useState<string>(() => loadStoredDevice());
  const [pin, setPin] = useState("");
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<SessionDetail | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [events, setEvents] = useState<EventEnvelope[]>([]);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<TabKey>("chat");
  const [workspacePath, setWorkspacePath] = useState("");
  const [loading, setLoading] = useState(false);
  const refreshTimeout = useRef<number | null>(null);

  const sortedApprovals = useMemo(
    () => [...approvals].sort((left, right) => right.createdAt - left.createdAt),
    [approvals]
  );

  const refreshAll = async (authToken: string, preferredThreadId?: string | null) => {
    const [sessionData, approvalData, workspaceData, lastSessionData] = await Promise.all([
      api<SessionSummary[]>("/api/sessions", authToken),
      api<ApprovalRequest[]>("/api/approvals", authToken),
      api<WorkspaceSummary[]>("/api/workspaces", authToken),
      api<{ threadId: string | null }>("/api/last-session", authToken)
    ]);

    setSessions(sessionData);
    setApprovals(approvalData);
    setWorkspaces(workspaceData);

    const targetThreadId =
      preferredThreadId ?? currentSessionId ?? lastSessionData.threadId ?? sessionData[0]?.id ?? null;

    if (targetThreadId) {
      setCurrentSessionId(targetThreadId);
      const detail = await api<SessionDetail>(`/api/sessions/${targetThreadId}`, authToken);
      setCurrentSession(detail);
    }
  };

  const queueRefresh = (preferredThreadId?: string | null) => {
    if (!token) {
      return;
    }

    if (refreshTimeout.current) {
      window.clearTimeout(refreshTimeout.current);
    }

    refreshTimeout.current = window.setTimeout(() => {
      refreshAll(token, preferredThreadId).catch(console.error);
    }, 350);
  };

  useEffect(() => {
    api<BridgeConfigResponse>("/api/config")
      .then(setConfig)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    refreshAll(token).catch((error) => {
      console.error(error);
      window.localStorage.removeItem(TOKEN_KEY);
      setToken(null);
    });
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/events?token=${token}`);

    socket.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as EventEnvelope | { type: "hello"; deviceName: string };
      if (parsed.type === "hello") {
        return;
      }

      setEvents((current) => [parsed, ...current].slice(0, 40));

      if (parsed.type === "approval") {
        setApprovals((current) => [parsed.payload, ...current.filter((entry) => entry.id !== parsed.payload.id)]);
      }

      if (parsed.type === "notification") {
        queueRefresh(parsed.threadId ?? null);
      }
    };

    socket.onclose = () => {
      queueRefresh(currentSessionId);
    };

    return () => socket.close();
  }, [token, currentSessionId]);

  const pairDevice = async () => {
    try {
      const response = await api<PairingResponse>("/api/auth/pair", null, {
        method: "POST",
        body: JSON.stringify({ pin, deviceName })
      });
      window.localStorage.setItem(TOKEN_KEY, response.token);
      window.localStorage.setItem(DEVICE_KEY, response.deviceName);
      setToken(response.token);
      setPairingError(null);
    } catch {
      setPairingError("Pairing failed. Check the desktop console PIN and try again.");
    }
  };

  const selectSession = async (sessionId: string) => {
    if (!token) {
      return;
    }
    setCurrentSessionId(sessionId);
    setTab("chat");
    setCurrentSession(await api<SessionDetail>(`/api/sessions/${sessionId}`, token));
  };

  const sendMessage = async () => {
    if (!token || !currentSessionId || !message.trim()) {
      return;
    }

    await api(`/api/sessions/${currentSessionId}/message`, token, {
      method: "POST",
      body: JSON.stringify({ text: message.trim() })
    });
    setMessage("");
    queueRefresh(currentSessionId);
  };

  const createSession = async () => {
    if (!token || !workspacePath.trim()) {
      return;
    }
    setLoading(true);
    try {
      const detail = await api<SessionDetail>("/api/sessions/start", token, {
        method: "POST",
        body: JSON.stringify({ cwd: workspacePath.trim() })
      });
      setWorkspacePath("");
      setCurrentSessionId(detail.id);
      setCurrentSession(detail);
      setTab("chat");
      await refreshAll(token, detail.id);
    } finally {
      setLoading(false);
    }
  };

  const runSessionAction = async (sessionId: string, action: "resume" | "fork") => {
    if (!token) {
      return;
    }

    const detail = await api<SessionDetail>(`/api/sessions/${sessionId}/${action}`, token, {
      method: "POST"
    });
    setCurrentSessionId(detail.id);
    setCurrentSession(detail);
    setTab("chat");
    await refreshAll(token, detail.id);
  };

  const answerApproval = async (approval: ApprovalRequest, decision: string, answers?: Record<string, { answers: string[] }>) => {
    if (!token) {
      return;
    }

    await api(`/api/approvals/${approval.id}/respond`, token, {
      method: "POST",
      body: JSON.stringify({ decision, answers })
    });
    setApprovals((current) => current.filter((entry) => entry.id !== approval.id));
    queueRefresh(approval.threadId);
  };

  if (!config) {
    return <main className="shell"><section className="panel hero">Loading bridge configuration...</section></main>;
  }

  if (!token) {
    return (
      <main className="shell">
        <section className="hero panel">
          <p className="eyebrow">Remote Codex Companion</p>
          <h1>Continue your local Codex session from your phone.</h1>
          <p className="lede">
            Pair this phone once, then keep chatting, approving actions, and watching session timelines over LAN or Tailscale.
          </p>
          <div className="hero-grid">
            <div className="metric-card">
              <span>Pairing</span>
              <strong>{config.pairingHint}</strong>
            </div>
            <div className="metric-card">
              <span>Status</span>
              <strong>{config.paired ? "Paired bridge" : "Fresh bridge"}</strong>
            </div>
          </div>
        </section>
        <section className="panel form-panel">
          <label>
            Device name
            <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} />
          </label>
          <label>
            Pairing PIN
            <input value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" />
          </label>
          {pairingError ? <p className="error-text">{pairingError}</p> : null}
          <button className="primary-button" onClick={pairDevice}>
            Pair trusted phone
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero compact-hero">
        <div>
          <p className="eyebrow">Trusted device</p>
          <h1>{currentSession?.name ?? currentSession?.preview ?? "Codex is ready"}</h1>
          <p className="lede">{currentSession ? truncatePath(currentSession.cwd) : "Pick a session or workspace."}</p>
        </div>
        <div className="hero-actions">
          <span className="badge">{sessions.filter((entry) => entry.status === "running").length} running</span>
          <span className="badge warning">{approvals.length} approvals</span>
        </div>
      </section>

      <nav className="tab-bar">
        {(["sessions", "chat", "approvals", "workspaces"] as TabKey[]).map((entry) => (
          <button
            key={entry}
            className={entry === tab ? "tab active" : "tab"}
            onClick={() => setTab(entry)}
          >
            {entry}
          </button>
        ))}
      </nav>

      {tab === "sessions" ? (
        <section className="panel list-panel">
          <div className="section-header">
            <h2>Recent sessions</h2>
            <span>{sessions.length}</span>
          </div>
          {sessions.map((session) => (
            <button key={session.id} className="session-card" onClick={() => selectSession(session.id)}>
              <div className="session-row">
                <strong>{(session.name ?? session.preview) || "Untitled session"}</strong>
                <span className={`status-pill ${session.status}`}>{session.status}</span>
              </div>
              <p>{truncatePath(session.cwd)}</p>
              <div className="session-row muted">
                <span>{session.git.branch ?? "no git"}</span>
                <span>{formatRelativeTime(session.updatedAt)}</span>
              </div>
              <div className="action-row">
                <span className="action-chip" onClick={(event) => { event.stopPropagation(); runSessionAction(session.id, "resume").catch(console.error); }}>resume</span>
                <span className="action-chip" onClick={(event) => { event.stopPropagation(); runSessionAction(session.id, "fork").catch(console.error); }}>fork</span>
              </div>
            </button>
          ))}
        </section>
      ) : null}

      {tab === "chat" ? (
        <>
          <section className="panel chat-panel">
            <div className="section-header">
              <h2>Conversation</h2>
              <span>{currentSession?.messages.length ?? 0} items</span>
            </div>
            <div className="message-list">
              {currentSession?.messages.map((entry) => (
                <article key={entry.id} className={entry.role === "assistant" ? "message assistant" : "message user"}>
                  <p className="message-role">{entry.role}</p>
                  <p>{entry.text || "..."}</p>
                </article>
              )) ?? <p className="empty-text">Choose or create a session to start chatting.</p>}
            </div>
          </section>

          <section className="panel timeline-panel">
            <div className="section-header">
              <h2>Timeline</h2>
              <span>{currentSession?.timeline.length ?? 0}</span>
            </div>
            <div className="timeline-list">
              {currentSession?.timeline.map((entry) => (
                <article key={entry.id} className="timeline-card">
                  <div className="session-row">
                    <strong>{entry.title}</strong>
                    {entry.status ? <span className="mini-status">{entry.status}</span> : null}
                  </div>
                  <pre>{entry.body}</pre>
                </article>
              )) ?? null}
            </div>
          </section>

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage().catch(console.error);
            }}
          >
            <textarea
              rows={3}
              placeholder="Continue the Codex session..."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <button className="primary-button" type="submit">
              Send
            </button>
          </form>
        </>
      ) : null}

      {tab === "approvals" ? (
        <section className="panel list-panel">
          <div className="section-header">
            <h2>Pending approvals</h2>
            <span>{sortedApprovals.length}</span>
          </div>
          {sortedApprovals.length === 0 ? <p className="empty-text">No approvals are waiting right now.</p> : null}
          {sortedApprovals.map((approval) => (
            <ApprovalCard key={approval.id} approval={approval} onSubmit={answerApproval} />
          ))}
        </section>
      ) : null}

      {tab === "workspaces" ? (
        <section className="panel list-panel">
          <div className="section-header">
            <h2>Workspaces</h2>
            <span>{workspaces.length}</span>
          </div>
          <div className="workspace-launcher">
            <input
              placeholder="C:\\path\\to\\repo"
              value={workspacePath}
              onChange={(event) => setWorkspacePath(event.target.value)}
            />
            <button className="primary-button" disabled={loading} onClick={createSession}>
              {loading ? "Opening..." : "Start session"}
            </button>
          </div>
          {workspaces.map((workspace) => (
            <button
              key={workspace.cwd}
              className="session-card"
              onClick={() => {
                setWorkspacePath(workspace.cwd);
                if (workspace.lastSessionId) {
                  selectSession(workspace.lastSessionId).catch(console.error);
                }
              }}
            >
              <div className="session-row">
                <strong>{workspace.label}</strong>
                <span>{workspace.git.branch ?? "no git"}</span>
              </div>
              <p>{truncatePath(workspace.cwd)}</p>
              <div className="session-row muted">
                <span>last session {workspace.lastSessionId ?? "none"}</span>
                <span>{formatRelativeTime(workspace.updatedAt)}</span>
              </div>
            </button>
          ))}
          <div className="event-strip">
            <div className="section-header">
              <h2>Live events</h2>
              <span>{events.length}</span>
            </div>
            {events.map((entry) => (
              <article key={entry.id} className="event-card">
                <strong>{entry.type === "notification" ? entry.method : entry.type}</strong>
                <p>{entry.threadId ?? "global"}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
};

type ApprovalCardProps = {
  approval: ApprovalRequest;
  onSubmit: (approval: ApprovalRequest, decision: string, answers?: Record<string, { answers: string[] }>) => Promise<void>;
};

const ApprovalCard = ({ approval, onSubmit }: ApprovalCardProps) => {
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const questionList = Array.isArray((approval.payload as { questions?: unknown[] }).questions)
    ? ((approval.payload as { questions: Array<{ id: string; question: string; options?: Array<{ label: string }> }> }).questions)
    : [];

  return (
    <article className="approval-card">
      <div className="session-row">
        <strong>{approval.title}</strong>
        <span className="badge">{approval.kind}</span>
      </div>
      <p>{approval.body}</p>
      {questionList.map((question) => (
        <div key={question.id} className="question-block">
          <label>{question.question}</label>
          <input
            placeholder={question.options?.map((entry: { label: string }) => entry.label).join(", ") || "Answer"}
            value={inputs[question.id] ?? ""}
            onChange={(event) =>
              setInputs((current) => ({
                ...current,
                [question.id]: event.target.value
              }))
            }
          />
        </div>
      ))}
      <div className="action-row">
        {approval.options.map((option: string) => (
          <button
            key={option}
            className={option.startsWith("accept") || option === "respond" ? "primary-button secondary" : "ghost-button"}
            onClick={() => {
              const answers =
                approval.kind === "userInput"
                  ? Object.fromEntries(
                      Object.entries(inputs).map(([key, value]: [string, string]) => [key, { answers: [value] }])
                    )
                  : undefined;
              const decision = approval.kind === "userInput" ? "respond" : option;
              onSubmit(approval, decision, answers).catch(console.error);
            }}
          >
            {option}
          </button>
        ))}
      </div>
    </article>
  );
};

export default App;
