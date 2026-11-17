/** Electron transports DSH resources without resolving package paths or module identities. */
export function createClientModuleResourceHandler(invoke) {
  return async request => {
    const url = new URL(request.url);
    if (url.protocol !== "opl-client:" || url.hostname !== "modules" || url.port || url.username || url.password
      || !url.pathname.startsWith("/plugins/")) return new Response(null, { status: 404 });
    if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405 });
    const resource = await invoke("readClientModuleBundle", {
      url: url.pathname + url.search,
      method: request.method,
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined
    });
    return new Response(request.method === "HEAD" || [204, 304].includes(resource.status)
      ? null : Buffer.from(resource.body, "base64"), {
      status: resource.status,
      headers: { ...resource.headers, "access-control-allow-origin": "*" }
    });
  };
}
