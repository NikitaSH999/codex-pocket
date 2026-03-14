# Setup

## Prerequisites

- Node.js 22+
- Local `codex` CLI installed and authenticated
- Same LAN access from phone, or a Tailscale tailnet between phone and PC

## Development

1. Run `npm install`
2. Run `npm run build`
3. Start the bridge with `npm run dev:bridge`
4. Start the PWA dev server with `npm run dev:pwa`
5. Open the Vite URL on the phone browser
6. Read the one-time pairing PIN from the bridge console and pair the device

## Production-style local run

1. `npm run build`
2. `npm run start:bridge`
3. Open `http://<pc-lan-ip>:8787` or the machine's Tailscale IP from the phone

## Environment variables

- `CODEX_PHONE_PORT`: bridge HTTP/WebSocket port, default `8787`
- `CODEX_PHONE_HOST`: bind host, default `0.0.0.0`
- `CODEX_APP_SERVER_PORT`: local Codex App Server port, default `8765`
- `CODEX_APP_SERVER_HOST`: local Codex App Server host, default `127.0.0.1`
- `CODEX_PHONE_AUTOSTART=false`: connect to an already running App Server instead of spawning one
- `CODEX_COMMAND`: override the Codex executable name or path
- `CODEX_PHONE_PIN`: set a fixed pairing PIN instead of generating a one-time PIN
