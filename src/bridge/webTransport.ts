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

let csrfTokenPromise: Promise<string | null> | undefined;

async function csrfToken(): Promise<string | null> {
  csrfTokenPromise ??= fetch("/api/auth/user")
    .then(async (response) => {
      if (response.status === 401) {
        globalThis.location?.replace("/login");
        throw new WebTransportError("authentication_required", "Authentication required");
      }
      const value = await response.json() as { csrfToken?: unknown };
      return typeof value.csrfToken === "string" ? value.csrfToken : null;
    })
    .catch((error) => {
      csrfTokenPromise = undefined;
      throw error;
    });
  return csrfTokenPromise;
}

async function authenticatedInit(init: RequestInit = {}): Promise<RequestInit> {
  const method = (init.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return init;
  const token = await csrfToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("x-csrf-token", token);
  return { ...init, headers };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, await authenticatedInit(init));
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

function chooseBrowserFiles(directory: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = !directory;
    if (directory) {
      input.setAttribute("webkitdirectory", "");
      input.setAttribute("directory", "");
    }
    input.addEventListener("change", () => resolve(Array.from(input.files ?? [])), { once: true });
    input.addEventListener("cancel", () => resolve([]), { once: true });
    input.click();
  });
}

async function deleteInputGroup(id: string): Promise<void> {
  await requestJson(`/api/inputs/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function stageBrowserFiles(files: readonly File[], kind: "files" | "directory"): Promise<Array<{
  kind: "file" | "folder" | "image";
  name: string;
  path: string;
  cleanupToken?: string;
  previewUrl?: string;
}>> {
  if (!files.length) return [];
  const oversized = files.find((file) => file.size > 30 * 1024 * 1024);
  if (oversized) throw new WebTransportError("upload_too_large", `${oversized.name} exceeds 30 MiB`);
  const group = await postJson<{ id: string }>("/api/inputs", { kind });
  try {
    for (const file of files) {
      const browserPath = kind === "directory"
        ? ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name)
        : file.name;
      await requestJson(`/api/inputs/${encodeURIComponent(group.id)}/files?path=${encodeURIComponent(browserPath)}`, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file
      });
    }
    const completed = await postJson<{ inputs: Array<{ kind: "file" | "folder" | "image"; name: string; path: string; cleanupToken?: string }> }>(
      `/api/inputs/${encodeURIComponent(group.id)}/complete`,
      {}
    );
    return completed.inputs.map((input) => {
      if (input.kind !== "image") return input;
      const source = files.find((file) => file.name === input.name);
      return { ...input, ...(source ? { previewUrl: URL.createObjectURL(source) } : {}) };
    });
  } catch (error) {
    await deleteInputGroup(group.id).catch(() => undefined);
    throw error;
  }
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
    pickFiles: () => chooseBrowserFiles(false).then((files) => stageBrowserFiles(files, "files")),
    pickDirectory: () => chooseBrowserFiles(true).then((files) => stageBrowserFiles(files, "directory")),
    resolveDroppedInputs: (files) => stageBrowserFiles(files, "files"),
    releaseInputs: async (cleanupTokens) => {
      await Promise.all([...new Set(cleanupTokens)].map((token) => deleteInputGroup(token)));
    },
    notifyCompletion: async ({ threadId, title, body }) => {
      if (!("Notification" in globalThis) || Notification.permission !== "granted") return;
      const notification = new Notification(title, { body });
      notification.onclick = () => {
        globalThis.focus();
        globalThis.dispatchEvent(new CustomEvent("opl:open-thread", { detail: { threadId } }));
        notification.close();
      };
    },
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
