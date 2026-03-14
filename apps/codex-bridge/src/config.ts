import path from "node:path";
import os from "node:os";

export type BridgeConfig = {
  bridgePort: number;
  bridgeHost: string;
  appServerPort: number;
  appServerHost: string;
  autoStartAppServer: boolean;
  codexCommand: string;
  dataDir: string;
  sessionTtlMs: number;
  pin: string | null;
};

const resolveNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const loadConfig = (): BridgeConfig => {
  const dataDir =
    process.env.CODEX_PHONE_DATA_DIR ??
    path.join(process.cwd(), "apps", "codex-bridge", "data");

  return {
    bridgePort: resolveNumber(process.env.CODEX_PHONE_PORT, 8787),
    bridgeHost: process.env.CODEX_PHONE_HOST ?? "0.0.0.0",
    appServerPort: resolveNumber(process.env.CODEX_APP_SERVER_PORT, 8765),
    appServerHost: process.env.CODEX_APP_SERVER_HOST ?? "127.0.0.1",
    autoStartAppServer: process.env.CODEX_PHONE_AUTOSTART !== "false",
    codexCommand: process.env.CODEX_COMMAND ?? (os.platform() === "win32" ? "codex.cmd" : "codex"),
    dataDir,
    sessionTtlMs: 1000 * 60 * 60 * 24 * 30,
    pin: process.env.CODEX_PHONE_PIN ?? null
  };
};

