import { asRecord, asStableId, hasOnlyKeys } from "./contributionWireValues.ts";

export const OPL_REMOTE_COMPANION_ACCESS_SCHEMA_VERSION = "opl-app-remote-companion-access.v1" as const;
export const OPL_REMOTE_COMPANION_ACCESS_STATUSES = [
  "unavailable",
  "unpaired",
  "reserving",
  "qr_ready",
  "awaiting_confirmation",
  "active",
  "revoking",
  "attention"
] as const;
export type OplRemoteCompanionAccessStatus = (typeof OPL_REMOTE_COMPANION_ACCESS_STATUSES)[number];

export type OplRemoteCompanionAccessAction =
  | { commandId: "pair.start"; input: { invitation_code: string; display_name: string } }
  | { commandId: "pair.refresh"; input: { pairing_id: string } }
  | { commandId: "pair.confirm"; input: { pairing_id: string; authentication_digits: string } }
  | { commandId: "pair.cancel"; input: { pairing_id: string } }
  | { commandId: "device.rename"; input: { device_id: string; display_name: string } }
  | { commandId: "pair.revoke"; input: { pairing_id: string } };

export type OplRemoteCompanionAccessPairing = {
  pairingId: string;
  manualCode?: string;
  authenticationDigits?: string;
  expiresAt: string;
  qrPayload?: string;
};

export type OplRemoteCompanionAccessDevice = {
  deviceId: string;
  deviceType: "desktop" | "mobile";
  displayName: string;
  authorizationState: "pending" | "authorized" | "revoking" | "revoked" | "attention";
  lastActivityAt: string | null;
};

export type OplRemoteCompanionAccessResult = {
  schemaVersion: typeof OPL_REMOTE_COMPANION_ACCESS_SCHEMA_VERSION;
  status: OplRemoteCompanionAccessStatus;
  unavailableReason?: string;
  pairing?: OplRemoteCompanionAccessPairing;
  devices?: OplRemoteCompanionAccessDevice[];
  actions: OplRemoteCompanionAccessAction[];
  refreshAfterMs?: number;
};

const REMOTE_COMPANION_MANUAL_CODE = /^[0-9A-HJKMNP-TV-Z]{12}$/;
const REMOTE_COMPANION_AUTHENTICATION_DIGITS = /^[0-9]{6}$/;
const REMOTE_COMPANION_RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

function remoteCompanionBoundedText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) return null;
  return /[\u0000-\u001f\u007f]/.test(value) ? null : value;
}

function remoteCompanionOpaqueId(value: unknown): string | null {
  return remoteCompanionBoundedText(value, 512);
}

function remoteCompanionTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64 || !REMOTE_COMPANION_RFC3339_UTC.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function remoteCompanionStatus(value: unknown): OplRemoteCompanionAccessStatus | null {
  return typeof value === "string" && OPL_REMOTE_COMPANION_ACCESS_STATUSES.includes(value as OplRemoteCompanionAccessStatus)
    ? value as OplRemoteCompanionAccessStatus
    : null;
}

function parseRemoteCompanionAction(value: unknown): OplRemoteCompanionAccessAction | null {
  const action = asRecord(value);
  if (!action || !hasOnlyKeys(action, ["command_id", "input"])) return null;
  switch (action.command_id) {
    case "pair.start": {
      const input = asRecord(action.input);
      const invitationCode = remoteCompanionBoundedText(input?.invitation_code, 512);
      const displayName = remoteCompanionBoundedText(input?.display_name, 256);
      return input && invitationCode && displayName && hasOnlyKeys(input, ["invitation_code", "display_name"])
        ? { commandId: "pair.start", input: { invitation_code: invitationCode, display_name: displayName } }
        : null;
    }
    case "pair.refresh":
    case "pair.cancel":
    case "pair.revoke": {
      const input = asRecord(action.input);
      const pairingId = remoteCompanionOpaqueId(input?.pairing_id);
      if (!input || !pairingId || !hasOnlyKeys(input, ["pairing_id"])) return null;
      return { commandId: action.command_id, input: { pairing_id: pairingId } };
    }
    case "pair.confirm": {
      const input = asRecord(action.input);
      const pairingId = remoteCompanionOpaqueId(input?.pairing_id);
      const authenticationDigits = remoteCompanionBoundedText(input?.authentication_digits, 6);
      if (
        !input
        || !pairingId
        || !authenticationDigits
        || !REMOTE_COMPANION_AUTHENTICATION_DIGITS.test(authenticationDigits)
        || !hasOnlyKeys(input, ["pairing_id", "authentication_digits"])
      ) return null;
      return { commandId: "pair.confirm", input: { pairing_id: pairingId, authentication_digits: authenticationDigits } };
    }
    case "device.rename": {
      const input = asRecord(action.input);
      const deviceId = remoteCompanionOpaqueId(input?.device_id);
      const displayName = remoteCompanionBoundedText(input?.display_name, 256);
      return input && deviceId && displayName && hasOnlyKeys(input, ["device_id", "display_name"])
        ? { commandId: "device.rename", input: { device_id: deviceId, display_name: displayName } }
        : null;
    }
    default:
      return null;
  }
}

function parseRemoteCompanionActions(value: unknown): OplRemoteCompanionAccessAction[] | null {
  if (!Array.isArray(value) || value.length > 6) return null;
  const actions = value.map(parseRemoteCompanionAction);
  if (!actions.every((action): action is OplRemoteCompanionAccessAction => action !== null)) return null;
  return new Set(actions.map((action) => action.commandId)).size === actions.length ? actions : null;
}

function parseRemoteCompanionPairing(value: unknown): OplRemoteCompanionAccessPairing | null {
  const pairing = asRecord(value);
  const pairingId = remoteCompanionOpaqueId(pairing?.pairing_id);
  const expiresAt = remoteCompanionTimestamp(pairing?.expires_at);
  if (
    !pairing
    || !pairingId
    || !expiresAt
    || !hasOnlyKeys(pairing, ["pairing_id", "manual_code", "authentication_digits", "expires_at", "qr_payload"])
  ) return null;
  const manualCode = pairing.manual_code === undefined ? undefined : remoteCompanionBoundedText(pairing.manual_code, 12);
  if (pairing.manual_code !== undefined && (!manualCode || !REMOTE_COMPANION_MANUAL_CODE.test(manualCode))) return null;
  const authenticationDigits = pairing.authentication_digits === undefined
    ? undefined
    : remoteCompanionBoundedText(pairing.authentication_digits, 6);
  if (
    pairing.authentication_digits !== undefined
    && (!authenticationDigits || !REMOTE_COMPANION_AUTHENTICATION_DIGITS.test(authenticationDigits))
  ) return null;
  const qrPayload = pairing.qr_payload === undefined ? undefined : remoteCompanionBoundedText(pairing.qr_payload, 8192);
  if (pairing.qr_payload !== undefined && !qrPayload) return null;
  return {
    pairingId,
    expiresAt,
    ...(manualCode ? { manualCode } : {}),
    ...(authenticationDigits ? { authenticationDigits } : {}),
    ...(qrPayload ? { qrPayload } : {})
  };
}

function parseRemoteCompanionDevice(value: unknown): OplRemoteCompanionAccessDevice | null {
  const device = asRecord(value);
  const deviceId = remoteCompanionOpaqueId(device?.device_id);
  const displayName = remoteCompanionBoundedText(device?.display_name, 256);
  const lastActivityAt = device?.last_activity_at === null ? null : remoteCompanionTimestamp(device?.last_activity_at);
  if (
    !device
    || !deviceId
    || (device.device_type !== "desktop" && device.device_type !== "mobile")
    || !displayName
    || !["pending", "authorized", "revoking", "revoked", "attention"].includes(String(device.authorization_state))
    || (device.last_activity_at !== null && !lastActivityAt)
    || !hasOnlyKeys(device, ["device_id", "device_type", "display_name", "authorization_state", "last_activity_at"])
  ) return null;
  return {
    deviceId,
    deviceType: device.device_type,
    displayName,
    authorizationState: device.authorization_state as OplRemoteCompanionAccessDevice["authorizationState"],
    lastActivityAt
  };
}

function parseRemoteCompanionDevices(value: unknown): OplRemoteCompanionAccessDevice[] | null {
  if (!Array.isArray(value) || value.length > 2) return null;
  const devices = value.map(parseRemoteCompanionDevice);
  if (!devices.every((device): device is OplRemoteCompanionAccessDevice => device !== null)) return null;
  return new Set(devices.map((device) => device.deviceId)).size === devices.length ? devices : null;
}

function parseRemoteCompanionRefreshAfterMs(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 250
    && value <= 60_000
    ? value
    : null;
}

function remoteCompanionPairingShape(
  status: OplRemoteCompanionAccessStatus,
  pairing: OplRemoteCompanionAccessPairing | undefined
): boolean {
  if (status === "qr_ready") return Boolean(pairing?.manualCode && pairing.qrPayload && !pairing.authenticationDigits);
  if (status === "awaiting_confirmation") return Boolean(pairing?.authenticationDigits && !pairing.manualCode && !pairing.qrPayload);
  if (status === "reserving" || status === "attention") {
    return pairing === undefined || (!pairing.manualCode && !pairing.authenticationDigits && !pairing.qrPayload);
  }
  if (status === "active" || status === "revoking") {
    return Boolean(pairing && !pairing.manualCode && !pairing.authenticationDigits && !pairing.qrPayload);
  }
  return true;
}

export function readRemoteCompanionAccessResult(value: unknown): OplRemoteCompanionAccessResult | null {
  const result = asRecord(value);
  const status = remoteCompanionStatus(result?.status);
  const actions = parseRemoteCompanionActions(result?.actions);
  const refreshAfterMs = parseRemoteCompanionRefreshAfterMs(result?.refresh_after_ms);
  if (!result || result.schema_version !== OPL_REMOTE_COMPANION_ACCESS_SCHEMA_VERSION || !status || !actions || refreshAfterMs === null) return null;

  const parsedPairing = result.pairing === undefined ? undefined : parseRemoteCompanionPairing(result.pairing);
  const parsedDevices = result.devices === undefined ? undefined : parseRemoteCompanionDevices(result.devices);
  if ((result.pairing !== undefined && !parsedPairing) || (result.devices !== undefined && !parsedDevices)) return null;
  const pairing = parsedPairing ?? undefined;
  const devices = parsedDevices ?? undefined;

  if (status === "unavailable" || status === "unpaired") {
    const parsedUnavailableReason = result.unavailable_reason === undefined ? undefined : asStableId(result.unavailable_reason);
    if (result.unavailable_reason !== undefined && !parsedUnavailableReason) return null;
    const unavailableReason = parsedUnavailableReason ?? undefined;
    if (
      (status === "unavailable" && !unavailableReason)
      || (status === "unpaired" && unavailableReason !== undefined)
      || pairing
      || devices
      || !hasOnlyKeys(result, ["schema_version", "status", "unavailable_reason", "actions", "refresh_after_ms"])
    ) return null;
    return {
      schemaVersion: OPL_REMOTE_COMPANION_ACCESS_SCHEMA_VERSION,
      status,
      actions,
      ...(unavailableReason === undefined ? {} : { unavailableReason }),
      ...(refreshAfterMs === undefined ? {} : { refreshAfterMs })
    };
  }

  if (
    !hasOnlyKeys(result, ["schema_version", "status", "unavailable_reason", "pairing", "devices", "actions", "refresh_after_ms"])
    || result.unavailable_reason !== undefined
    || !remoteCompanionPairingShape(status, pairing)
  ) return null;
  if ((status === "active" || status === "revoking") && (!devices || devices.length < 1)) return null;
  if ((status === "reserving" || status === "qr_ready" || status === "awaiting_confirmation") && devices !== undefined) return null;
  return {
    schemaVersion: OPL_REMOTE_COMPANION_ACCESS_SCHEMA_VERSION,
    status,
    actions,
    ...(pairing === undefined ? {} : { pairing }),
    ...(devices === undefined ? {} : { devices }),
    ...(refreshAfterMs === undefined ? {} : { refreshAfterMs })
  };
}
