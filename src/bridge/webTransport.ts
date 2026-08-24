import {
  normalizeBridgeEvent,
  parseEventSourceMessage,
  type OplStateReadback,
  type OplBridgeEvent,
  type OplStudioSurface
} from "./oplBridge";

type WebSurface = OplStudioSurface;

declare global {
  interface Window {
    oplStudio?: OplStudioSurface;
  }
}

class WebTransportError extends Error {
  code: string;
  details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "WebTransportError";
    this.code = code;
    this.details = details;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new WebTransportError("local_host_unavailable", "Local WebUI host is unavailable", {
      cause: String(error)
    });
  }
  const value = await response.json() as T & {
    error?: { code?: string; message?: string; details?: Record<string, unknown> };
  };
  if (!response.ok || value.error) {
    throw new WebTransportError(
      value.error?.code ?? "web_transport_error",
      value.error?.message ?? `Web transport failed with HTTP ${response.status}`,
      value.error?.details
    );
  }
  return value;
}

function postJson<T>(url: string, value: unknown): Promise<T> {
  return requestJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value)
  });
}

function connectServerEvents(
  eventSourceUrl: string,
  onEvent: (event: OplBridgeEvent) => void
): () => void {
  const source = new EventSource(eventSourceUrl);
  source.onopen = () => onEvent(normalizeBridgeEvent({ type: "bridge.ready", source: eventSourceUrl }, "web_transport_sse"));
  source.onmessage = (message) => onEvent(parseEventSourceMessage(message.data, "web_transport_sse"));
  source.onerror = () => onEvent(normalizeBridgeEvent({ type: "bridge.error", source: eventSourceUrl }, "web_transport_sse"));
  return () => source.close();
}

export function installWebTransport(): void {
  const eventSourceUrl = "/api/opl-events";
  const subscribeEvents = (onEvent: (event: OplBridgeEvent) => void) => connectServerEvents(eventSourceUrl, onEvent);
  const surface: WebSurface = {
    eventSourceUrl,
    platformCapabilities: {
      workspaceRootSelection: false,
      codexInstall: false,
      modelAccessSecretInput: true
    },
    beginWindowDrag: () => undefined,
    readState: (profile = "fast") => requestJson<OplStateReadback>(`/api/opl/state?profile=${encodeURIComponent(profile)}`),
    readInitialize: () => requestJson("/api/opl/initialize"),
    readFullDrilldown: () => requestJson("/api/opl/drilldown"),
    readDomainDetailView: (request) => postJson("/api/opl/view/read", request),
    readContribution: (request) => postJson("/api/opl/contribution/read", request),
    executeAction: (request) => postJson("/api/opl/action", request),
    readCodexModels: () => requestJson("/api/codex/models"),
    readCodexCapabilities: (threadId) => requestJson(`/api/codex/capabilities${threadId ? `?threadId=${encodeURIComponent(threadId)}` : ""}`),
    readCodexPermissionProfiles: () => requestJson("/api/codex/permission-profiles"),
    listPendingServerRequests: () => requestJson("/api/codex/pending-requests"),
    respondToServerRequest: (request) => postJson("/api/codex/respond-request", request),
    pickFiles: () => Promise.reject(new WebTransportError("native_picker_unavailable", "The local WebUI cannot expose native file paths")),
    pickDirectory: () => Promise.reject(new WebTransportError("native_picker_unavailable", "The local WebUI cannot expose native folder paths")),
    listThreadWorkspace: (request) => postJson("/api/threads/workspace/list", request),
    readThreadWorkspaceFile: (request) => postJson("/api/threads/workspace/read", request),
    searchThreadWorkspace: (request) => postJson("/api/threads/workspace/search", request),
    setLogDirectory: () => Promise.resolve({
      schema: "opl_app_log_directory_update.v1",
      owner: "one-person-lab-app_native_host",
      carrier: "standalone_headless_webui",
      action: "application.setLogDirectory",
      status: "unsupported",
      success: false,
      reasonCode: "desktop_host_required"
    }),
    sendMessage: (request) => postJson("/api/send-message", request),
    steerTurn: (request) => postJson("/api/turns/steer", request),
    interruptTurn: (request) => postJson("/api/turns/interrupt", request),
    loginGatewayAccount: (request) => postJson("/api/opl-runtime/gateway-account-login", request),
    configureCodexApiKey: (request) => postJson("/api/opl-runtime/configure-codex", request),
    readNativeAppUpdateStatus: () => requestJson("/api/native-app-update/status"),
    checkNativeAppUpdate: () => postJson("/api/native-app-update/check", {}),
    applyNativeAppUpdate: () => postJson("/api/native-app-update/apply", {}),
    restartNativeApp: () => postJson("/api/native-app-update/restart", {}),
    listThreads: (request = {}) => postJson("/api/threads/list", request),
    readThread: (request) => postJson("/api/threads/read", request),
    resumeThread: (request) => postJson("/api/threads/resume", request),
    forkThread: (request) => postJson("/api/threads/fork", request),
    renameThread: (request) => postJson("/api/threads/rename", request),
    deleteThread: (request) => postJson("/api/threads/delete", request),
    setArchived: (request) => postJson(request.archived ? "/api/threads/archive" : "/api/threads/unarchive", request),
    subscribeEvents,
    connectEvents: subscribeEvents
  };
  window.oplStudio = surface;
}
