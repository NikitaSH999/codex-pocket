import path from "node:path";

import { buildApp } from "./app";
import { collectListenUrls } from "./network/listen-urls";
import { attemptUpnpPortMapping } from "./network/port-mapper";

const PORT = Number(process.env.PORT ?? 4318);
const HOST = "0.0.0.0";
const WORKSPACE = process.cwd();
const DATA_DIR = path.join(WORKSPACE, ".local");
const NETWORK_ACCESS_MODE = process.env.ALLOW_REMOTE === "true" ? "public" : "private";
const AUTO_PORTMAP = process.env.AUTO_PORTMAP === "true";

async function main(): Promise<void> {
  const app = await buildApp({
    dataDir: DATA_DIR,
    workspacePath: WORKSPACE,
    port: PORT,
    networkAccessMode: NETWORK_ACCESS_MODE,
  });

  await app.listen({
    port: PORT,
    host: HOST,
  });

  console.log(`Codex Mobile WebUI listening on ${HOST}:${PORT}`);
  console.log(`Network mode: ${NETWORK_ACCESS_MODE}`);
  for (const entry of collectListenUrls(PORT)) {
    console.log(`${entry.label}: ${entry.url}`);
  }

  if (AUTO_PORTMAP) {
    console.log(`Attempting UPnP port mapping for TCP ${PORT}...`);
    void attemptUpnpPortMapping(PORT)
      .then((result) => {
        if (result.ok) {
          const externalTarget = result.externalIp ?? "<router-public-ip>";
          console.log(
            `UPnP port mapping active: http://${externalTarget}:${result.externalPort ?? PORT}/ -> ${result.internalHost}:${PORT}`,
          );
          return;
        }

        console.log(
          `UPnP port mapping failed: ${result.reason ?? "router did not expose a usable gateway"}`,
        );
      })
      .catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        console.log(`UPnP port mapping failed: ${detail}`);
      });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
