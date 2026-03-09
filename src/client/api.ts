import type {
  AuthResponse,
  CodexHistoryListResponse,
  CreateSessionRequest,
  ImportHistoryRequest,
  SendMessageRequest,
  SessionListResponse,
  SessionResponse,
  SettingsResponse,
  UpdateModeRequest,
  UpdateSettingsRequest,
  WorkspaceBrowserResponse,
} from "../shared/contracts";

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export const api = {
  getSettings(): Promise<SettingsResponse> {
    return requestJson<SettingsResponse>("/api/settings");
  },
  setup(pin: string): Promise<AuthResponse> {
    return requestJson<AuthResponse>("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ pin }),
    });
  },
  login(pin: string): Promise<AuthResponse> {
    return requestJson<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ pin }),
    });
  },
  logout(): Promise<AuthResponse> {
    return requestJson<AuthResponse>("/api/auth/logout", {
      method: "POST",
    });
  },
  listSessions(): Promise<SessionListResponse> {
    return requestJson<SessionListResponse>("/api/sessions");
  },
  listHistory(workspacePath?: string): Promise<CodexHistoryListResponse> {
    const query = workspacePath ? `?workspacePath=${encodeURIComponent(workspacePath)}` : "";
    return requestJson<CodexHistoryListResponse>(`/api/history${query}`);
  },
  createSession(payload: CreateSessionRequest): Promise<SessionResponse> {
    return requestJson<SessionResponse>("/api/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getSession(sessionId: string): Promise<SessionResponse> {
    return requestJson<SessionResponse>(`/api/sessions/${sessionId}`);
  },
  sendMessage(sessionId: string, payload: SendMessageRequest): Promise<SessionResponse> {
    return requestJson<SessionResponse>(`/api/sessions/${sessionId}/message`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateMode(sessionId: string, payload: UpdateModeRequest): Promise<SessionResponse> {
    return requestJson<SessionResponse>(`/api/sessions/${sessionId}/mode`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  importHistory(payload: ImportHistoryRequest): Promise<SessionResponse> {
    return requestJson<SessionResponse>("/api/history/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  browseWorkspace(targetPath?: string): Promise<WorkspaceBrowserResponse> {
    const query = targetPath ? `?path=${encodeURIComponent(targetPath)}` : "";
    return requestJson<WorkspaceBrowserResponse>(`/api/workspaces/browse${query}`);
  },
  saveSettings(payload: UpdateSettingsRequest): Promise<SettingsResponse> {
    return requestJson<SettingsResponse>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
};
