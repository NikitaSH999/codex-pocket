# Research Notes for codex-pocket 0.0.2v

## Sources checked

- OpenAI Codex App Server docs: `https://developers.openai.com/codex/app-server`
- OpenAI App Server README in repo: `https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md`
- Habr article: `https://habr.com/ru/articles/1005146/`
- Existing repo baseline: `https://github.com/NikitaSH999/codex-pocket`

## What the official docs confirm

- `codex app-server` is the right substrate for a phone wrapper, not something to replace.
- The protocol already exposes thread lifecycle methods such as `thread/start`, `thread/list`, `thread/read`, `thread/resume`, `thread/fork`, and `thread/archive`.
- Turn execution continues through `turn/start`.
- Approvals and structured user questions are first-class server requests, so the phone UI should proxy them rather than invent its own approval model.
- WebSocket transport is officially supported, which matches the bridge approach used here.

## What the older codex-pocket repo shows

- The original repo already proved the product shape: mobile-first browser UI, local bridge, PIN auth, workspace/session history, live stream, and LAN/remote access.
- The old version is broader in surface area than the current rebuild: model list, MCP surfacing, slash commands, NAT/static-IP helpers, and more elaborate session state reducers.
- The new `0.0.2v` implementation is cleaner and closer to the official App Server contract, but it is intentionally smaller in scope today.

## Practical conclusion

- Yes, this implementation fits the same `codex-pocket` repository and should be treated as the `0.0.2v` line.
- The safest product direction is:
  - keep the repo identity and upgrade path,
  - keep the bridge/PWA split from the new implementation,
  - bring back selected features from `0.0.1` only when they are verified against current `app-server` behavior.

## Gaps to fold back from 0.0.1 later

- richer MCP visibility
- model/runtime preference selection
- stronger session history index
- optional remote/network helper scripts
- more polished composer features like attachments and slash commands
