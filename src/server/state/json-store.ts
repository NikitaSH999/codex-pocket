import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PersistedState } from "../../shared/contracts";

interface JsonStoreOptions {
  dataDir: string;
  workspacePath: string;
}

const DEFAULT_STATE_FILE = "state.json";

export class JsonStore {
  private readonly filePath: string;
  private statePromise: Promise<PersistedState> | null = null;

  constructor(private readonly options: JsonStoreOptions) {
    this.filePath = path.join(options.dataDir, DEFAULT_STATE_FILE);
  }

  async read(): Promise<PersistedState> {
    if (!this.statePromise) {
      this.statePromise = this.load();
    }

    return structuredClone(await this.statePromise);
  }

  async write(updater: (state: PersistedState) => PersistedState): Promise<PersistedState> {
    const current = await this.read();
    const next = updater(current);
    await mkdir(this.options.dataDir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next, null, 2), "utf8");
    this.statePromise = Promise.resolve(next);
    return structuredClone(next);
  }

  private async load(): Promise<PersistedState> {
    await mkdir(this.options.dataDir, { recursive: true });

    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedState;
      return {
        auth: {
          pinHash: parsed.auth?.pinHash ?? null,
          cookieSecret: parsed.auth?.cookieSecret ?? randomSecret(),
        },
        settings: {
          workspacePath: parsed.settings?.workspacePath ?? this.options.workspacePath,
          defaultMode: parsed.settings?.defaultMode ?? "default",
        },
        sessions: parsed.sessions ?? {},
      };
    } catch {
      const state = createInitialState(this.options.workspacePath);
      await writeFile(this.filePath, JSON.stringify(state, null, 2), "utf8");
      return state;
    }
  }
}

function createInitialState(workspacePath: string): PersistedState {
  return {
    auth: {
      pinHash: null,
      cookieSecret: randomSecret(),
    },
    settings: {
      workspacePath,
      defaultMode: "default",
    },
    sessions: {},
  };
}

function randomSecret(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}
