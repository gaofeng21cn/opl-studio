import { asRecord, asString, parseJsonValue } from "./oplBridge-primitives";
import type { OplEventKind } from "@gaofeng21cn/opl-host-contracts";
import type { OplBridgeEvent } from "@gaofeng21cn/opl-host-contracts";

function classifyEventKind(methodOrType: string, payload: Record<string, unknown> | null): OplEventKind {
  const text = methodOrType.toLowerCase();
  const item = asRecord(payload?.item);
  const itemType = asString(item?.type)?.toLowerCase() ?? "";
  if (text.includes("permission")) return "permission";
  if (text.includes("user_input") || text.includes("input")) return "user_input";
  if (text.includes("receipt")) return "receipt";
  if (text.includes("tool") || itemType.includes("tool")) return "tool";
  if (text.includes("diff")) return "diff";
  if (text.includes("file")) return "file";
  return "process";
}

export function normalizeBridgeEvent(value: unknown, source = "bridge"): OplBridgeEvent {
  const record = asRecord(value);
  const method = asString(record?.method);
  if (method) {
    const params = asRecord(record?.params) ?? {};
    const item = asRecord(params.item);
    return {
      method,
      params,
      source,
      eventKind: classifyEventKind(method, params),
      summary: method,
      turnId: asString(params.turnId) ?? asString(asRecord(params.turn)?.id),
      delta: asString(params.delta),
      itemText: asString(item?.text),
      raw: value
    };
  }
  const type = asString(record?.type) ?? "bridge.event";
  return {
    type,
    source,
    eventKind: classifyEventKind(type, record),
    summary: type,
    raw: value
  };
}



export function parseEventSourceMessage(data: string, source = "web_transport_sse"): OplBridgeEvent {
  return normalizeBridgeEvent(parseJsonValue(data) ?? { type: "bridge.event", data }, source);
}
