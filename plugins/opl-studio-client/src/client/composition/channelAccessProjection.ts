import { asRecord, asStableId, asString, hasOnlyKeys, type OplContributionInput } from "./contributionWireValues.ts";

export type OplChannelAccessAction = {
  commandId: string;
  input: OplContributionInput;
};

export type OplChannelAccessConnection = {
  state: "disconnected" | "connecting" | "authorizing" | "qr_ready" | "qr_scanned" | "pin_required" | "connected" | "attention";
  accountDisplayName?: string;
  reasonCode?: string;
  verificationChallenge?: { challengeId: string; expiresAtMs: number; retry: boolean };
  qrChallenge?: {
    payload: string;
    expiresAtMs: number;
  };
};

export type OplChannelAccessPairing = {
  pairingId: string;
  platformUserId?: string;
  displayName?: string;
  requestedAtMs: number;
  expiresAtMs: number;
  actions: OplChannelAccessAction[];
};

export type OplChannelAccessUser = {
  userId: string;
  platformUserId?: string;
  displayName?: string;
  authorizedAtMs: number;
  lastActiveAtMs?: number;
  actions: OplChannelAccessAction[];
};

export type OplChannelAccessResult = {
  schemaVersion: "opl-app-channel-access.v1";
  status: "available" | "unavailable";
  channelId: string;
  unavailableReason?: string;
  connection?: OplChannelAccessConnection;
  actions: OplChannelAccessAction[];
  pendingPairings: OplChannelAccessPairing[];
  authorizedUsers: OplChannelAccessUser[];
  refreshAfterMs?: number;
};

function asBoundedString(value: unknown, maximum: number): string | null {
  const normalized = asString(value);
  return normalized && normalized.length <= maximum ? normalized : null;
}

function asInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function parseChannelAccessInput(
  value: unknown,
  scope: "channel" | "pairing" | "user"
): OplContributionInput | null {
  const input = asRecord(value);
  const channelId = asStableId(input?.channel_id);
  if (!input || !channelId) return null;
  const pairingId = asBoundedString(input.pairing_id, 512);
  const userId = asBoundedString(input.user_id, 512);
  if (scope === "pairing" && pairingId && hasOnlyKeys(input, ["channel_id", "pairing_id"])) {
    return { channel_id: channelId, pairing_id: pairingId };
  }
  if (scope === "user" && userId && hasOnlyKeys(input, ["channel_id", "user_id"])) {
    return { channel_id: channelId, user_id: userId };
  }
  const challengeId = asBoundedString(input.challenge_id, 512);
  if (scope === "channel" && hasOnlyKeys(input, ["channel_id", "challenge_id"])) {
    if (input.challenge_id !== undefined && !challengeId) return null;
    return { channel_id: channelId, ...(challengeId ? { challenge_id: challengeId } : {}) };
  }
  return null;
}

function parseChannelAccessAction(
  value: unknown,
  scope: "channel" | "pairing" | "user"
): OplChannelAccessAction | null {
  const action = asRecord(value);
  const commandId = asStableId(action?.command_id);
  const input = parseChannelAccessInput(action?.input, scope);
  return action && commandId && input && hasOnlyKeys(action, ["command_id", "input"])
    ? { commandId, input }
    : null;
}

function parseChannelAccessActions(
  value: unknown,
  maximum: number,
  scope: "channel" | "pairing" | "user"
): OplChannelAccessAction[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const actions = value.map((action) => parseChannelAccessAction(action, scope));
  if (!actions.every((action): action is OplChannelAccessAction => action !== null)) return null;
  return new Set(actions.map((action) => JSON.stringify(action))).size === actions.length ? actions : null;
}

function parseChannelAccessConnection(value: unknown): OplChannelAccessConnection | null {
  const connection = asRecord(value);
  const state = asString(connection?.state);
  if (
    !connection
    || !hasOnlyKeys(connection, ["state", "account_display_name", "reason_code", "qr_challenge", "verification_challenge"])
    || !state
    || !["disconnected", "connecting", "authorizing", "qr_ready", "qr_scanned", "pin_required", "connected", "attention"].includes(state)
  ) {
    return null;
  }
  const accountDisplayName = asBoundedString(connection.account_display_name, 256);
  const reasonCode = asStableId(connection.reason_code);
  if (connection.account_display_name !== undefined && !accountDisplayName) return null;
  if (connection.reason_code !== undefined && !reasonCode) return null;
  const qrChallengeRecord = connection.qr_challenge === undefined ? null : asRecord(connection.qr_challenge);
  const qrPayload = asBoundedString(qrChallengeRecord?.payload, 8192);
  const qrExpiresAtMs = asInteger(qrChallengeRecord?.expires_at_ms);
  if (
    connection.qr_challenge !== undefined
    && (
      !qrChallengeRecord
      || !hasOnlyKeys(qrChallengeRecord, ["payload", "expires_at_ms"])
      || !qrPayload
      || qrExpiresAtMs === null
    )
  ) return null;
  const verification = connection.verification_challenge === undefined ? null : asRecord(connection.verification_challenge);
  const challengeId = asBoundedString(verification?.challenge_id, 512);
  const challengeExpiry = asInteger(verification?.expires_at_ms);
  if (connection.qr_challenge !== undefined && (!['qr_ready', 'authorizing'].includes(state) || qrExpiresAtMs === 0)) return null;
  if (state === 'authorizing' && !qrPayload) return null;
  if (state === 'pin_required') {
    if (!verification || !hasOnlyKeys(verification, ['challenge_id', 'expires_at_ms', 'retry'])
      || !challengeId || !challengeExpiry || typeof verification.retry !== 'boolean') return null;
  } else if (connection.verification_challenge !== undefined) return null;
  return {
    state: state as OplChannelAccessConnection["state"],
    ...(verification && challengeId && challengeExpiry ? { verificationChallenge: { challengeId, expiresAtMs: challengeExpiry, retry: verification.retry as boolean } } : {}),
    ...(accountDisplayName ? { accountDisplayName } : {}),
    ...(reasonCode ? { reasonCode } : {}),
    ...(qrPayload && qrExpiresAtMs !== null ? { qrChallenge: { payload: qrPayload, expiresAtMs: qrExpiresAtMs } } : {})
  };
}

function parseChannelAccessPairing(value: unknown): OplChannelAccessPairing | null {
  const pairing = asRecord(value);
  if (!pairing || !hasOnlyKeys(pairing, ["pairing_id", "platform_user_id", "display_name", "requested_at_ms", "expires_at_ms", "actions"])) return null;
  const pairingId = asBoundedString(pairing.pairing_id, 512);
  const requestedAtMs = asInteger(pairing?.requested_at_ms);
  const expiresAtMs = asInteger(pairing?.expires_at_ms);
  const actions = parseChannelAccessActions(pairing?.actions, 20, "pairing");
  if (!pairingId || requestedAtMs === null || expiresAtMs === null || actions === null) return null;
  const platformUserId = asBoundedString(pairing.platform_user_id, 512);
  const displayName = asBoundedString(pairing.display_name, 256);
  if (pairing.platform_user_id !== undefined && !platformUserId) return null;
  if (pairing.display_name !== undefined && !displayName) return null;
  return {
    pairingId,
    ...(platformUserId ? { platformUserId } : {}),
    ...(displayName ? { displayName } : {}),
    requestedAtMs,
    expiresAtMs,
    actions
  };
}

function parseChannelAccessUser(value: unknown): OplChannelAccessUser | null {
  const user = asRecord(value);
  if (!user || !hasOnlyKeys(user, ["user_id", "platform_user_id", "display_name", "authorized_at_ms", "last_active_at_ms", "actions"])) return null;
  const userId = asBoundedString(user.user_id, 512);
  const authorizedAtMs = asInteger(user?.authorized_at_ms);
  const actions = parseChannelAccessActions(user?.actions, 20, "user");
  if (!userId || authorizedAtMs === null || actions === null) return null;
  const platformUserId = asBoundedString(user.platform_user_id, 512);
  const displayName = asBoundedString(user.display_name, 256);
  if (user.platform_user_id !== undefined && !platformUserId) return null;
  if (user.display_name !== undefined && !displayName) return null;
  const lastActiveAtMs = user.last_active_at_ms === undefined ? null : asInteger(user.last_active_at_ms);
  if (user.last_active_at_ms !== undefined && lastActiveAtMs === null) return null;
  return {
    userId,
    ...(platformUserId ? { platformUserId } : {}),
    ...(displayName ? { displayName } : {}),
    authorizedAtMs,
    ...(lastActiveAtMs !== null ? { lastActiveAtMs } : {}),
    actions
  };
}

export function readChannelAccessResult(value: unknown): OplChannelAccessResult | null {
  const result = asRecord(value);
  const channelId = asStableId(result?.channel_id);
  const status = asString(result?.status);
  if (
    !result
    || !hasOnlyKeys(result, ["schema_version", "status", "channel_id", "unavailable_reason", "connection", "actions", "pending_pairings", "authorized_users", "refresh_after_ms"])
    || result.schema_version !== "opl-app-channel-access.v1"
    || !channelId
    || !status
  ) return null;
  if (status === "unavailable") {
    const unavailableReason = asStableId(result.unavailable_reason);
    if (!unavailableReason || !hasOnlyKeys(result, ["schema_version", "status", "channel_id", "unavailable_reason"])) {
      return null;
    }
    return {
      schemaVersion: "opl-app-channel-access.v1",
      status,
      channelId,
      unavailableReason,
      actions: [],
      pendingPairings: [],
      authorizedUsers: []
    };
  }
  if (status !== "available") return null;
  const connection = parseChannelAccessConnection(result.connection);
  const actions = parseChannelAccessActions(result.actions, 20, "channel");
  const pairings = Array.isArray(result.pending_pairings) && result.pending_pairings.length <= 100
    ? result.pending_pairings.map(parseChannelAccessPairing)
    : null;
  const users = Array.isArray(result.authorized_users) && result.authorized_users.length <= 100
    ? result.authorized_users.map(parseChannelAccessUser)
    : null;
  if (
    !connection
    || actions === null
    || !pairings
    || pairings.some((pairing) => pairing === null)
    || !users
    || users.some((user) => user === null)
  ) return null;
  if (result.unavailable_reason !== undefined) return null;
  if (new Set(pairings.map((pairing) => JSON.stringify(pairing))).size !== pairings.length) return null;
  if (new Set(users.map((user) => JSON.stringify(user))).size !== users.length) return null;
  const refreshAfterMs = result.refresh_after_ms === undefined ? null : asInteger(result.refresh_after_ms);
  if (result.refresh_after_ms !== undefined && (refreshAfterMs === null || refreshAfterMs < 250 || refreshAfterMs > 60_000)) return null;
  return {
    schemaVersion: "opl-app-channel-access.v1",
    status,
    channelId,
    connection,
    actions,
    pendingPairings: pairings as OplChannelAccessPairing[],
    authorizedUsers: users as OplChannelAccessUser[],
    ...(refreshAfterMs !== null ? { refreshAfterMs } : {})
  };
}
