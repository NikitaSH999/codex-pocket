import http from "node:http";
import { WebSocketServer } from "ws";
import type { EventEnvelope, BridgeConfigResponse } from "@codex-phone/shared";
import { AuthService } from "./auth.js";
import { loadConfig } from "./config.js";
import { CodexRpcClient } from "./codex/client.js";
import { CodexAppServerProcess } from "./codex/process.js";
import { CodexBridgeService } from "./codex/service.js";
import { StateStore } from "./persistence.js";
import { createApp } from "./routes.js";

const config = loadConfig();
const stateStore = new StateStore(config.dataDir);
const auth = new AuthService(stateStore, config.sessionTtlMs, config.pin);
const appServerUrl = `ws://${config.appServerHost}:${config.appServerPort}`;

const processManager = config.autoStartAppServer
  ? new CodexAppServerProcess(config.codexCommand, appServerUrl)
  : null;
const rpcClient = new CodexRpcClient(appServerUrl);
const bridgeService = new CodexBridgeService(processManager, rpcClient, stateStore);
const hasExistingPairing = auth.getPairingHint() === "configured";

const configResponse: BridgeConfigResponse = {
  appName: "codex-pocket",
  pairingHint: hasExistingPairing
    ? "Trusted phone already paired. Reuse its saved token or pair a new device from the desktop."
    : "Check the Codex bridge console on your PC for the one-time pairing PIN.",
  paired: hasExistingPairing,
  trustedDeviceName: null
};

await bridgeService.start();

const app = createApp(auth, bridgeService, configResponse);
const server = http.createServer(app);
const websocketServer = new WebSocketServer({ server, path: "/events" });

websocketServer.on("connection", (socket, request) => {
  const url = new URL(request.url ?? "", `http://${request.headers.host ?? "localhost"}`);
  const token = url.searchParams.get("token");
  const valid = auth.validateToken(token);

  if (!valid) {
    socket.close(4001, "unauthorized");
    return;
  }

  const listener = (event: EventEnvelope) => {
    socket.send(JSON.stringify(event));
  };

  bridgeService.onBridgeEvent(listener);
  socket.send(JSON.stringify({ type: "hello", deviceName: valid.deviceName }));

  socket.on("close", () => {
    bridgeService.offBridgeEvent(listener);
  });
});

server.listen(config.bridgePort, config.bridgeHost, () => {
  console.log(`[codex-phone] Bridge listening on http://${config.bridgeHost}:${config.bridgePort}`);
  console.log(`[codex-phone] Connected to Codex App Server at ${appServerUrl}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    websocketServer.close();
    server.close();
    rpcClient.close();
    processManager?.stop();
    process.exit(0);
  });
}
