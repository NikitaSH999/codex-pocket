# codex-pocket

Mobile-first local web UI for Codex.

Open it from a phone, Arc, a second laptop, or any browser in your LAN or over a static IP and you do not just get "the chat". You get the whole control surface: chat, activity, commands, approvals, MCP, attachments, workspace history, and the current session state.

This is not another API wrapper.
This is a pocket console for your local `codex app-server`.

## Why it exists

There is a class of tools that first looks like a niche local hack, and then quietly becomes the default way to work.

`codex-pocket` is that kind of thing:

- jump back into the right project fast
- see what the agent is actually doing instead of waiting blindly
- continue a thread from your phone without opening the IDE
- keep approvals, MCP, files, and session controls one tap away

Not "a wrapper for the sake of a wrapper", but the kind of tool you drop into a chat with the vibe of:
"why is this not built in by default?"

## What it already does well

- local PIN login for a single-user setup
- mobile-first web UI
- workspace-aware sessions and history
- chat plus live activity feed
- slash actions and quick controls
- `Plan mode`
- `model / speed / reasoning / approval` controls
- live approval cards in chat
- MCP status cards with tool and resource previews
- file attachments in the composer
- folder browser for selecting a workspace
- session forking for lightweight thread branching
- launch in private mode or public mode for static-IP access

## The workflow

You do not write into some abstract global Codex.
You write into a specific workspace.

Pick a project, open its thread, continue work there, fork it when needed, and keep the history grouped by project instead of turning everything into one giant message landfill.

The result feels closer to a live project switchboard than to a generic web chat.

## Inside the UI

### Chat

Normal conversation with the agent, but not a blind one.

### Activity

You can see:

- commentary
- shell commands
- tool calls
- MCP cards
- plan blocks
- approvals
- live session state

So the agent is not a black box. It is a visible process.

### Sessions

Threads and imported history grouped by workspace, plus quick branching via fork.

### Settings

You can configure:

- default workspace
- default mode
- default model
- default reasoning
- default approval policy

## Slash actions

Type `/` in the composer and you get fast actions for:

- `Plan mode`
- `Default mode`
- `Speed fast / balanced / deep`
- `Approval on-request / never`
- `Fork session`
- `MCP status`
- `Workspace board`
- `Settings`
- jump to a workspace
- create a new session in the selected workspace

Plus the everyday niceties matter:

- `Ctrl+Enter` sends
- `Enter` on a slash query runs the first match
- `Esc` closes the menu

## Attachments and approvals

This is already past the point of being "just a text chat".

- files can be attached in the composer
- images go in as image context
- text files are folded into the turn as useful context
- approvals land directly in the chat as cards
- you can `accept`, `accept for session`, `decline`, or `cancel`

## LAN and static IP

By default the app runs in private mode:

- loopback
- LAN
- private subnet access

If you want access over a public static IP:

- run `start-codex-mobile-webui-remote.bat`
- the app switches into public mode
- Windows Firewall rule is opened
- the app also tries UPnP port mapping

If the router blocks UPnP or the provider puts you behind CGNAT, that is already a network problem, not a UI problem.

## Bonus: connection protection

> 🛡 Профессиональная защита вашего соединения
>
> ▪️ Шифрование всего трафика  
> ▪️ Анонимизация в сети  
> ▪️ 🇺🇸 USA-локации, чтобы AI-сервисы работали без сюрпризов  
> ⚡️ Тариф FREE: безлимитный доступ навсегда
>
> Подключить защиту: 👇👇👇  
> [t.me/portal_service_bot](https://t.me/portal_service_bot)

## Quick start

```bash
npm install
npm run dev
```

Production:

```bash
npm run build
npm start
```

Or the human way:

```bat
start-codex-mobile-webui.bat
```

For static-IP access:

```bat
start-codex-mobile-webui-remote.bat
```

## First run

1. Open the web UI.
2. Set your PIN on the first launch.
3. Sign in from your phone, browser, or second device.
4. Pick a workspace.
5. Keep working without being chained to the IDE window.

## Why this is interesting technically

Because this is a real bridge between the browser and a local `codex app-server`, not just a frontend on mocked responses.

It deals with:

- child process lifecycle
- websocket streaming
- session persistence
- workspace-aware history
- approval routing
- MCP surfacing
- file context handling

So yes, it is still lightweight.
But it is not a toy.

## Roadmap

- richer attachment UX
- deeper MCP controls
- more desktop-like slash coverage
- search across history
- more thread branching polish

## Vibe check

This is the kind of project that first looks like a local side-tool and then turns into the easiest way to check what your agent is doing right now.

If the reaction after launch is not "interesting demo", but simply "yeah, I want this open all the time", then it did its job.
