import { nanoid } from "nanoid";

import type {
  ActivityItem,
  CollaborationModeKind,
  CommandRecord,
  PlanBlock,
  SessionApproval,
  SessionEvent,
  SessionMessage,
  SessionPreferences,
  SessionRecord,
  ToolRecord,
} from "../../shared/contracts";

interface SessionSeed {
  id: string;
  threadId: string;
  cwd: string;
  mode: CollaborationModeKind;
  preferences: SessionPreferences;
  title?: string;
}

export function createSessionRecord(seed: SessionSeed): SessionRecord {
  const now = Date.now();

  return {
    id: seed.id,
    threadId: seed.threadId,
    title: seed.title ?? "Новая сессия",
    cwd: seed.cwd,
    createdAt: now,
    updatedAt: now,
    mode: seed.mode,
    preferences: seed.preferences,
    status: "idle",
    messages: [],
    activity: [],
    commands: [],
    tools: [],
    planBlocks: [],
    approvals: [],
  };
}

export function reduceSessionEvent(
  session: SessionRecord,
  event: SessionEvent,
): SessionRecord {
  const next: SessionRecord = {
    ...session,
    messages: [...session.messages],
    activity: [...session.activity],
    commands: [...session.commands],
    tools: [...session.tools],
    planBlocks: [...session.planBlocks],
    approvals: [...session.approvals],
    updatedAt: Date.now(),
  };

  switch (event.type) {
    case "chat_message": {
      upsertMessage(next, event);
      break;
    }
    case "status_update":
    case "session_state_changed": {
      next.status = event.status;
      next.activity.unshift({
        id: nanoid(),
        type: "status_update",
        turnId: event.turnId,
        status: event.status,
        createdAt: Date.now(),
        detail: event.detail,
      });
      break;
    }
    case "command_started": {
      const command: CommandRecord = {
        itemId: event.itemId,
        turnId: event.turnId,
        command: event.command,
        cwd: event.cwd,
        status: "running",
        aggregatedOutput: "",
        exitCode: null,
        durationMs: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      next.commands.unshift(command);
      next.activity.unshift({
        id: nanoid(),
        type: "command",
        itemId: event.itemId,
        turnId: event.turnId,
        command: event.command,
        cwd: event.cwd,
        status: "running",
        createdAt: Date.now(),
      });
      next.status = "running";
      break;
    }
    case "command_output": {
      const command = findCommand(next.commands, event.itemId);
      if (command) {
        command.aggregatedOutput += event.delta;
        command.updatedAt = Date.now();
      }
      break;
    }
    case "command_finished": {
      const command = findCommand(next.commands, event.itemId);
      if (command) {
        command.exitCode = event.exitCode;
        command.durationMs = event.durationMs;
        command.status = event.exitCode === 0 ? "completed" : "failed";
        command.updatedAt = Date.now();
      }
      patchActivity(next.activity, event.itemId, {
        status: event.exitCode === 0 ? "completed" : "failed",
      });
      break;
    }
    case "tool_started": {
      const tool: ToolRecord = {
        itemId: event.itemId,
        turnId: event.turnId,
        label: event.label,
        status: "running",
        ok: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      next.tools.unshift(tool);
      next.activity.unshift({
        id: nanoid(),
        type: "tool",
        itemId: event.itemId,
        turnId: event.turnId,
        label: event.label,
        status: "running",
        createdAt: Date.now(),
      });
      break;
    }
    case "tool_finished": {
      const tool = findTool(next.tools, event.itemId);
      if (tool) {
        tool.ok = event.ok;
        tool.status = event.ok ? "completed" : "failed";
        tool.updatedAt = Date.now();
      }
      patchActivity(next.activity, event.itemId, {
        status: event.ok ? "completed" : "failed",
        detail: event.detail,
      });
      break;
    }
    case "plan_block_detected": {
      upsertPlanBlock(next.planBlocks, event.itemId, event.turnId, event.text);
      next.activity.unshift({
        id: nanoid(),
        type: "plan",
        itemId: event.itemId,
        turnId: event.turnId,
        createdAt: Date.now(),
        detail: event.text,
      });
      break;
    }
    case "approval_requested": {
      upsertApproval(next.approvals, event.approval);
      next.status = "waiting";
      next.activity.unshift({
        id: nanoid(),
        type: "status_update",
        turnId: event.approval.turnId,
        status: "waiting",
        createdAt: Date.now(),
        detail:
          event.approval.kind === "command"
            ? `Approval needed: ${event.approval.command ?? "command"}`
            : `Approval needed for file changes${event.approval.grantRoot ? ` in ${event.approval.grantRoot}` : ""}`,
      });
      break;
    }
    case "approval_resolved": {
      const approval = next.approvals.find((item) => item.requestId === event.requestId);
      if (approval) {
        approval.status = "resolved";
        approval.updatedAt = Date.now();
        approval.decision = event.decision;
      }
      next.activity.unshift({
        id: nanoid(),
        type: "status_update",
        turnId: approval?.turnId ?? "turn",
        status: "running",
        createdAt: Date.now(),
        detail: `Approval ${event.decision}`,
      });
      break;
    }
  }

  if (next.title === "Новая сессия") {
    const firstUserMessage = next.messages.find((message) => message.role === "user");
    if (firstUserMessage?.text.trim()) {
      next.title = firstUserMessage.text.trim().slice(0, 48);
    }
  }

  return next;
}

function upsertMessage(
  session: SessionRecord,
  event: Extract<SessionEvent, { type: "chat_message" }>,
): void {
  const existing = session.messages.find((message) => message.itemId === event.itemId);

  if (!existing) {
    const text = event.delta ? event.text + event.delta : event.text;
    const record: SessionMessage = {
      itemId: event.itemId,
      turnId: event.turnId,
      role: event.role,
      text,
      state: event.state,
      createdAt: Date.now(),
    };
    session.messages.push(record);
    maybeCapturePlan(session.planBlocks, record);
    return;
  }

  existing.text = event.delta ? existing.text + event.delta : event.text;
  existing.state = event.state;
  maybeCapturePlan(session.planBlocks, existing);
}

function maybeCapturePlan(planBlocks: PlanBlock[], message: SessionMessage): void {
  if (message.role !== "assistant" || !message.text.includes("<proposed_plan>")) {
    return;
  }

  upsertPlanBlock(planBlocks, message.itemId, message.turnId, message.text);
}

function upsertPlanBlock(
  planBlocks: PlanBlock[],
  itemId: string,
  turnId: string,
  text: string,
): void {
  const existing = planBlocks.find((block) => block.itemId === itemId);

  if (!existing) {
    planBlocks.unshift({
      itemId,
      turnId,
      text,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return;
  }

  existing.text = text;
  existing.updatedAt = Date.now();
}

function findCommand(
  commands: CommandRecord[],
  itemId: string,
): CommandRecord | undefined {
  return commands.find((command) => command.itemId === itemId);
}

function findTool(tools: ToolRecord[], itemId: string): ToolRecord | undefined {
  return tools.find((tool) => tool.itemId === itemId);
}

function patchActivity(
  activity: ActivityItem[],
  itemId: string,
  patch: Partial<ActivityItem>,
): void {
  const entry = activity.find(
    (item) =>
      ("itemId" in item && item.itemId === itemId) ||
      (item.type === "plan" && item.itemId === itemId),
  );

  if (entry) {
    Object.assign(entry, patch);
  }
}

function upsertApproval(approvals: SessionApproval[], next: SessionApproval): void {
  const existing = approvals.find((approval) => approval.requestId === next.requestId);
  if (existing) {
    Object.assign(existing, next, { updatedAt: Date.now() });
    return;
  }

  approvals.unshift(next);
}
