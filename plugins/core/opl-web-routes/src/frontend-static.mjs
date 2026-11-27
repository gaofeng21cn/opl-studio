import path from "node:path";
import { Peer } from "@deepseek-ai/dsh-client-connection";
import * as frontendStatic from "@deepseek-ai/dsh-host-frontend-static";

// Adapt the official static plugin to Studio's existing authentication owner.
// This isolated view provides only the plugin's index admission and rendering
// contract; it does not activate DSH Connection, credentials, RPC, or Sessions.
export async function registerOplFrontend(ctx, { webAuth, webRoot, webHost = "127.0.0.1" }) {
  const webServer = ctx.webServer;
  const distIndex = path.resolve(webRoot, "index.html");
  const distRoot = path.dirname(distIndex);
  const browserPeer = new Peer(ctx, { principal: { kind: "owner" }, interactions: "none" });
  const frontend = ctx.isolate("connection").isolate("webServer");
  // The official Fetch resource omits the socket. A loopback-bound listener is
  // reachable only by local peers; forwarded headers still fail local auth.
  const localListener = ["127.0.0.1", "::1"].includes(webHost);
  const authRequest = (request) => ({ url: new URL(request.url).pathname, headers: Object.fromEntries(request.headers), socket: { remoteAddress: localListener ? webHost : undefined } });
  const admission = (request) => webAuth.requireSession(authRequest(request));
  const redirect = (request) => new Response(null, {
    status: 302,
    headers: { location: `${webAuth.basePath(authRequest(request))}login`, "cache-control": "no-store" }
  });

  frontend.provide("connection", Object.freeze({
    browserPeer,
    authorizeIndex(request, response) {
      if (admission(request).ok) return true;
      const refusal = redirect(request);
      response.writeHead(refusal.status, Object.fromEntries(refusal.headers));
      response.end();
      return false;
    }
  }));
  frontend.provide("webServer", Object.freeze({
    renderIndex: (html, peer) => webServer.renderIndex(html, peer),
    registerFallback({ resource }) {
      return webServer.registerFallback({
        auth: "anonymous",
        async resource(request, peer) {
          // HTTP assets and index share Studio's auth fence. A local resource
          // reader must explicitly use the page scope owned by this adapter.
          if (peer !== undefined && peer !== browserPeer) return new Response(null, { status: 403 });
          if (peer === undefined && !admission(request).ok) return redirect(request);
          // These product entry points use the same upstream-rendered index.
          // Keep navigation at the original URL so the client sees the intent.
          const url = new URL(request.url);
          if (["/guid", "/first-run", "/startup-gate"].includes(url.pathname)) {
            url.pathname = "/";
            request = new Request(url, { method: request.method, headers: request.headers, signal: request.signal });
          }
          const response = await resource(request, browserPeer);
          const pathname = decodeURIComponent(url.pathname);
          const target = path.resolve(path.normalize(path.join(distRoot, pathname)));
          if (request.method === "HEAD" || response.status !== 200 || (target !== distRoot && target !== distIndex)) {
            return response;
          }
          // The official plugin inserts the first base tag after its index
          // render. Preserve the trusted reverse-proxy path without replacing
          // its static-file, traversal, ETag, or body lifecycle implementation.
          const html = (await response.text()).replace('<base href="./">', `<base href="${webAuth.basePath(authRequest(request))}">`);
          return new Response(html, { status: response.status, headers: response.headers });
        }
      });
    }
  }));
  await frontend.plugin(frontendStatic, { distIndex });
}
