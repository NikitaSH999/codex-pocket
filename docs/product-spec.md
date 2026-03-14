# Product Spec

## Goal

Give one trusted phone a clean way to continue an active local Codex workflow on one PC without opening a remote desktop or full terminal. This is the `codex-pocket` `0.0.2v` direction.

## Core jobs

- Continue an existing Codex thread from the phone
- Read streamed progress, plans, diffs, and command output
- Approve or decline file/system actions
- Resume or fork prior threads
- Start a new session in a known local workspace

## Deliberate non-goals for v1

- Multi-machine orchestration
- Full browser TTY as the primary experience
- Public internet exposure by default
- Team roles and multi-user session sharing

## Primary UX surfaces

- `Sessions`: recent threads with status, cwd, and repo context
- `Chat`: message stream and timeline of commands/diffs
- `Approvals`: command, file-change, permission, and request-user-input prompts
- `Workspaces`: previously used paths and quick start for a new session
