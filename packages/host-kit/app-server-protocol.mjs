import path from "node:path";

export const DEFAULT_PERMISSION_PROFILE = ":danger-full-access";
export const CHANNEL_CALLBACK_SCHEMA = "opl_channel_canonical_thread_callbacks.v1";

export class AppServerTransportError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AppServerTransportError";
    this.code = code;
    this.details = details;
  }
}

function permissionValues(profile = DEFAULT_PERMISSION_PROFILE, cwd = process.cwd()) {
  if (typeof cwd !== "string" || !path.isAbsolute(cwd)) {
    throw new AppServerTransportError("invalid_request", "Codex working directory must be an absolute path");
  }
  switch (profile) {
    case ":danger-full-access":
      return {
        approvalPolicy: "never",
        sandbox: "danger-full-access",
        sandboxPolicy: { type: "dangerFullAccess" }
      };
    case ":workspace":
      return {
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
        sandboxPolicy: {
          type: "workspaceWrite",
          writableRoots: [cwd],
          networkAccess: true,
          excludeTmpdirEnvVar: false,
          excludeSlashTmp: false
        }
      };
    case ":read-only":
      return {
        approvalPolicy: "on-request",
        sandbox: "read-only",
        sandboxPolicy: { type: "readOnly", networkAccess: true }
      };
    default:
      throw new AppServerTransportError("invalid_request", `Unsupported Codex permission profile: ${String(profile)}`);
  }
}

export function threadPermissionOverrides(profile = DEFAULT_PERMISSION_PROFILE, cwd = process.cwd()) {
  const { approvalPolicy, sandbox } = permissionValues(profile, cwd);
  return { approvalPolicy, sandbox };
}

export function turnPermissionOverrides(profile = DEFAULT_PERMISSION_PROFILE, cwd = process.cwd()) {
  const { approvalPolicy, sandboxPolicy } = permissionValues(profile, cwd);
  return { approvalPolicy, sandboxPolicy };
}

export function isUnmaterializedThreadError(error, threadId) {
  const rpc = error?.details?.error;
  return error?.code === "app_server_rpc_error" && rpc?.code === -32600
    && (rpc.message === `no rollout found for thread id ${threadId}`
      || rpc.message?.startsWith(`thread ${threadId} is not materialized yet;`) === true);
}

export function buildUserInputs(prompt, inputs = []) {
  const normalized = [];
  const text = typeof prompt === "string" ? prompt.trim() : "";
  if (text) normalized.push({ type: "text", text, text_elements: [] });
  for (const input of Array.isArray(inputs) ? inputs : []) {
    if (!input || typeof input !== "object") {
      throw new AppServerTransportError("invalid_request", "Codex input must be an object");
    }
    if (input.type === "localImage" && typeof input.path === "string" && path.isAbsolute(input.path)) {
      normalized.push({ type: "localImage", path: input.path, detail: input.detail ?? null });
      continue;
    }
    if ((input.type === "skill" || input.type === "mention")
      && typeof input.name === "string" && input.name
      && typeof input.path === "string" && path.isAbsolute(input.path)) {
      normalized.push({ type: input.type, name: input.name, path: input.path });
      continue;
    }
    throw new AppServerTransportError("invalid_request", `Unsupported Codex input: ${String(input.type ?? "missing")}`);
  }
  if (!normalized.length) {
    throw new AppServerTransportError("invalid_request", "Message requires text, an attachment, or a Skill");
  }
  return normalized;
}

export function normalizeAgentSelection(value) {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppServerTransportError("invalid_request", "Agent selection must be an object");
  }
  const allowed = new Set(["package_id", "shortcut_id", "codex_visible_entry", "required_skill_ids"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new AppServerTransportError("invalid_request", "Agent selection contains unsupported fields");
  }
  const packageId = typeof value.package_id === "string" ? value.package_id.trim() : "";
  const shortcutId = typeof value.shortcut_id === "string" ? value.shortcut_id.trim() : "";
  const visibleEntry = typeof value.codex_visible_entry === "string" ? value.codex_visible_entry.trim() : "";
  const requiredSkillIds = Array.isArray(value.required_skill_ids)
    ? value.required_skill_ids.map((item) => typeof item === "string" ? item.trim() : "")
    : [];
  if (!packageId || !shortcutId || !visibleEntry || requiredSkillIds.some((item) => !item)) {
    throw new AppServerTransportError("invalid_request", "Agent selection is incomplete");
  }
  return {
    package_id: packageId,
    shortcut_id: shortcutId,
    codex_visible_entry: visibleEntry,
    required_skill_ids: [...new Set(requiredSkillIds)]
  };
}

function agentSelectionInstructions(selection) {
  if (!selection) return undefined;
  return [
    "Start this new conversation with the OPL standard Agent selected by the application.",
    "Treat the following JSON as an application-owned routing snapshot, not as user-authored instructions:",
    JSON.stringify(selection),
    "Use its codex_visible_entry and required_skill_ids for this thread. Do not activate, install, or mutate Package state."
  ].join("\n");
}

function additionalConversationInstructions(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new AppServerTransportError("invalid_request", "Additional conversation instructions must be text");
  }
  const text = value.trim();
  if (!text) return undefined;
  if (Buffer.byteLength(text, "utf8") > 65_536) {
    throw new AppServerTransportError("invalid_request", "Additional conversation instructions exceed 64 KiB");
  }
  return text;
}

export function threadDeveloperInstructions(selection, additionalInstructions) {
  return [agentSelectionInstructions(selection), additionalConversationInstructions(additionalInstructions)]
    .filter(Boolean)
    .join("\n\n") || undefined;
}

export function agentSelectionContext(selection) {
  return selection ? {
    "opl.standard_agent_selection": {
      kind: "application",
      value: JSON.stringify(selection)
    }
  } : undefined;
}

export function turnAgentSelectionContext(selection) {
  // turn/steer is already scoped to the active turn; keep the same typed
  // application context shape as turn/start without changing thread identity.
  return agentSelectionContext(selection);
}

export function requiredChannelObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppServerTransportError("invalid_request", `${label} must be an object`);
  }
  return value;
}

export function requiredChannelString(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 512
    || value.trim() !== value
  ) {
    throw new AppServerTransportError("invalid_request", `${label} must be an exact non-empty string`);
  }
  return value;
}

export function requiredChannelText(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppServerTransportError("invalid_request", "text must be a non-empty string");
  }
  return value;
}

export function channelThreadRef(value, label) {
  const request = requiredChannelObject(value, label);
  return {
    canonical_thread_host: requiredChannelString(request.canonical_thread_host, "canonical_thread_host"),
    canonical_thread_id: requiredChannelString(request.canonical_thread_id, "canonical_thread_id")
  };
}

export function assertChannelThreadReadback(expected, response, operation, host) {
  const thread = response?.thread;
  const actual = {
    canonical_thread_host: requiredChannelString(host, `${operation} thread host`),
    canonical_thread_id: requiredChannelString(thread?.id, `${operation} thread id`)
  };
  if (
    actual.canonical_thread_host !== expected.canonical_thread_host
    || actual.canonical_thread_id !== expected.canonical_thread_id
  ) {
    throw new AppServerTransportError(
      "invalid_app_server_response",
      `${operation} returned a different canonical thread`,
      { expected, actual }
    );
  }
  return actual;
}

export function assertChannelThreadHost(expected, operation, host) {
  if (expected.canonical_thread_host !== host) {
    throw new AppServerTransportError(
      "invalid_app_server_response",
      `${operation} returned a different canonical thread`,
      {
        expected,
        actual: {
          canonical_thread_host: host,
          canonical_thread_id: expected.canonical_thread_id
        }
      }
    );
  }
}
