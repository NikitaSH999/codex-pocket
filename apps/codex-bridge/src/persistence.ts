import fs from "node:fs";
import path from "node:path";

export type StoredToken = {
  token: string;
  deviceName: string;
  expiresAt: number;
};

export type AppState = {
  pinHash: string | null;
  pairingHint: string | null;
  tokens: StoredToken[];
  lastActiveThreadId: string | null;
};

const defaultState = (): AppState => ({
  pinHash: null,
  pairingHint: null,
  tokens: [],
  lastActiveThreadId: null
});

export class StateStore {
  private readonly stateFile: string;
  private state: AppState;

  constructor(private readonly dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.stateFile = path.join(dataDir, "state.json");
    this.state = this.load();
  }

  private load(): AppState {
    if (!fs.existsSync(this.stateFile)) {
      return defaultState();
    }

    try {
      const raw = fs.readFileSync(this.stateFile, "utf8");
      const parsed = JSON.parse(raw) as Partial<AppState>;
      return {
        ...defaultState(),
        ...parsed,
        tokens: Array.isArray(parsed.tokens) ? parsed.tokens : []
      };
    } catch {
      return defaultState();
    }
  }

  read(): AppState {
    return this.state;
  }

  update(mutator: (current: AppState) => AppState) {
    this.state = mutator(this.state);
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
  }
}

