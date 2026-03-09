import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { CodexHistoryEntry, SessionMessage, SessionRecord } from "../../shared/contracts";
import { createSessionRecord } from "../state/session-reducer";

interface HistoryIndexOptions {
  sessionsRoot: string;
  workspacePath?: string;
  limit?: number;
}

interface ParsedHistoryFile {
  entry: CodexHistoryEntry;
  messages: SessionMessage[];
}

export async function indexCodexHistory(
  options: HistoryIndexOptions,
): Promise<CodexHistoryEntry[]> {
  const files = await collectJsonlFiles(options.sessionsRoot);
  const entries: CodexHistoryEntry[] = [];

  for (const file of files) {
    const parsed = await parseHistoryFile(file);
    if (!parsed) {
      continue;
    }

    if (options.workspacePath && parsed.entry.cwd !== options.workspacePath) {
      continue;
    }

    entries.push(parsed.entry);
  }

  entries.sort((left, right) => right.updatedAt - left.updatedAt);
  return entries.slice(0, options.limit ?? 50);
}

export async function importHistorySession(
  historyPath: string,
  mode: "default" | "plan" = "default",
): Promise<SessionRecord | null> {
  const parsed = await parseHistoryFile(historyPath);
  if (!parsed) {
    return null;
  }

  const session = createSessionRecord({
    id: parsed.entry.threadId,
    threadId: parsed.entry.threadId,
    cwd: parsed.entry.cwd,
    mode,
    title: compactTitle(parsed.entry.preview),
  });

  session.createdAt = parsed.entry.createdAt;
  session.updatedAt = parsed.entry.updatedAt;
  session.messages = parsed.messages;
  session.status = "done";
  return session;
}

async function collectJsonlFiles(root: string): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(root, {
      recursive: true,
      withFileTypes: true,
    });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => path.join(entry.path, entry.name));
}

async function parseHistoryFile(filePath: string): Promise<ParsedHistoryFile | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    let sessionMeta:
      | {
          id: string;
          cwd: string;
          source: string;
          timestamp?: string;
        }
      | null = null;
    const messages: SessionMessage[] = [];

    for (const line of lines) {
      const item = JSON.parse(line) as {
        timestamp?: string;
        type?: string;
        payload?: any;
      };

      if (item.type === "session_meta" && item.payload?.id && item.payload?.cwd) {
        sessionMeta = {
          id: item.payload.id,
          cwd: item.payload.cwd,
          source: item.payload.source ?? "unknown",
          timestamp: item.payload.timestamp ?? item.timestamp,
        };
        continue;
      }

      if (item.type === "event_msg" && item.payload?.type === "user_message") {
        messages.push({
          itemId: `history-user-${messages.length + 1}`,
          turnId: `history-turn-${messages.length + 1}`,
          role: "user",
          text: item.payload.message ?? "",
          state: "final",
          createdAt: toMillis(item.timestamp),
        });
        continue;
      }

      if (item.type === "event_msg" && item.payload?.type === "agent_message") {
        messages.push({
          itemId: `history-assistant-${messages.length + 1}`,
          turnId: `history-turn-${messages.length + 1}`,
          role: "assistant",
          text: item.payload.message ?? "",
          state: "final",
          createdAt: toMillis(item.timestamp),
        });
      }
    }

    if (!sessionMeta) {
      return null;
    }

    const statsTime = toMillis(sessionMeta.timestamp);
    const preview = messages.find((message) => message.role === "user")?.text ?? "Untitled chat";

    return {
      entry: {
        threadId: sessionMeta.id,
        path: filePath,
        cwd: sessionMeta.cwd,
        preview,
        source: sessionMeta.source,
        createdAt: statsTime,
        updatedAt: messages.at(-1)?.createdAt ?? statsTime,
      },
      messages,
    };
  } catch {
    return null;
  }
}

function toMillis(value?: string): number {
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function compactTitle(input: string): string {
  return input.trim().slice(0, 60) || "Imported chat";
}
