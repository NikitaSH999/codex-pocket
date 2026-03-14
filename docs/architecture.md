# Architecture

## Components

### `apps/codex-bridge`

- Runs on the same PC as Codex
- Optionally starts `codex app-server`
- Connects to the App Server over WebSocket JSON-RPC
- Exposes a narrow HTTP API plus `/events` WebSocket for the phone
- Persists pairing state and last active thread in a local JSON file

### `apps/mobile-pwa`

- React + Vite PWA optimized for phone screens
- Uses REST for snapshots and WebSocket for live updates
- Stores the trusted-device token in browser storage

### `packages/shared`

- Shared transport and UI contract types used by both sides

## Protocol approach

The bridge does not invent a second agent protocol. It uses official `codex app-server` methods for:

- `thread/start`, `thread/list`, `thread/read`, `thread/resume`, `thread/fork`, `thread/archive`
- `turn/start`
- server-initiated approval and `requestUserInput` callbacks
- streamed notifications for turns, files, commands, plans, and reasoning

## State model

- Stateless snapshots come from fresh App Server reads
- Minimal local state is persisted only for trusted-device tokens and last active thread
- Pending approvals are held in memory while the current bridge process is alive

