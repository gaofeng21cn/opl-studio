import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

function invariant(condition, message) { if (!condition) throw new Error(message); }
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** A VM-only HTTPS fixture serving immutable candidate bytes to unmodified signed clients. */
export function loadUpgradeNetworkManifest(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  invariant(manifest.schema === "opl_studio_upgrade_network_fixture.v1", "Invalid upgrade network fixture");
  invariant(Array.isArray(manifest.releases) && manifest.releases.length > 0, "Exact candidate releases are required");
  const files = new Map();
  const releases = manifest.releases.map((release) => {
    invariant(["gaofeng21cn/one-person-lab-app", "gaofeng21cn/opl-studio"].includes(release.repository), "Unexpected update repository");
    invariant(/^v[0-9][A-Za-z0-9.-]+$/.test(release.tag), "Invalid exact update tag");
    invariant(Array.isArray(release.assets) && release.assets.length > 0, "Candidate asset inventory is required");
    const assets = release.assets.map((asset) => {
      invariant(typeof asset.name === "string" && path.basename(asset.name) === asset.name && !asset.name.includes(".."), "Invalid asset name");
      invariant(/^[a-f0-9]{64}$/.test(asset.sha256 ?? "") && Number.isSafeInteger(asset.size) && asset.size > 0, "Exact asset digest and size are required");
      const file = path.resolve(path.dirname(manifestPath), asset.path);
      const stat = fs.lstatSync(file);
      invariant(stat.isFile() && !stat.isSymbolicLink() && stat.size === asset.size && sha256(fs.readFileSync(file)) === asset.sha256, `Candidate asset identity mismatch: ${asset.name}`);
      const pathname = `/${release.repository}/releases/download/${release.tag}/${asset.name}`;
      invariant(!files.has(pathname), "Duplicate release asset path");
      files.set(pathname, { file, size: asset.size, sha256: asset.sha256, name: asset.name });
      return { name: asset.name, size: asset.size, digest: `sha256:${asset.sha256}`, browser_download_url: `https://github.com${pathname}` };
    });
    return { repository: release.repository, tag_name: release.tag, name: release.tag, draft: false, prerelease: false, html_url: `https://github.com/${release.repository}/releases/tag/${release.tag}`, published_at: manifest.created_at, assets };
  });
  invariant(new Set(releases.map((release) => release.repository)).size === releases.length, "One exact target per repository is required");
  return { files, releases, manifestSha256: sha256(fs.readFileSync(manifestPath)) };
}

export function resolveFixtureResponse(fixture, hostname, requestPath) {
  const url = new URL(requestPath, `https://${hostname}`);
  if (!["github.com", "api.github.com"].includes(hostname)) return null;
  const release = fixture.releases.find((item) => url.pathname.startsWith(hostname === "api.github.com" ? `/repos/${item.repository}/releases` : `/${item.repository}/releases`));
  if (!release) return null;
  if (hostname === "api.github.com") {
    if (url.pathname === `/repos/${release.repository}/releases`) return { json: url.searchParams.get("page") === "1" || !url.searchParams.has("page") ? [release] : [] };
    if (url.pathname === `/repos/${release.repository}/releases/latest` || url.pathname === `/repos/${release.repository}/releases/tags/${release.tag_name}`) return { json: release };
  } else {
    if (url.pathname === `/${release.repository}/releases/latest`) return { json: release };
    if (url.pathname === `/${release.repository}/releases.atom`) return { xml: `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>OPL isolated update fixture</title><entry><id>${release.html_url}</id><title>${release.tag_name}</title><updated>${release.published_at}</updated><link href="${release.html_url}"/><content>Exact candidate upgrade qualification</content></entry></feed>` };
    const asset = fixture.files.get(decodeURIComponent(url.pathname));
    if (asset) return { asset };
  }
  return null;
}

export async function serveUpgradeNetwork({ manifestPath, keyPath, certPath, port = 443, host = "127.0.0.1", requestLog }) {
  const fixture = loadUpgradeNetworkManifest(manifestPath);
  invariant(host === "127.0.0.1", "Upgrade network fixture must bind only the guest loopback interface");
  const server = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, (request, response) => {
    const hostname = String(request.headers.host ?? "").split(":")[0];
    const route = ["GET", "HEAD"].includes(request.method) ? resolveFixtureResponse(fixture, hostname, request.url) : null;
    if (requestLog) fs.appendFileSync(requestLog, `${JSON.stringify({ at: new Date().toISOString(), host: hostname, path: request.url, method: request.method, matched: Boolean(route), manifestSha256: fixture.manifestSha256 })}\n`, { mode: 0o600 });
    if (!route) { response.writeHead(404); response.end("Unmapped qualification endpoint"); return; }
    if (route.asset) {
      const { asset } = route;
      let start = 0;
      let end = asset.size - 1;
      let status = 200;
      if (request.headers.range) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range);
        if (!range) { response.writeHead(416); response.end(); return; }
        start = Number(range[1]); end = range[2] ? Number(range[2]) : end;
        if (start > end || end >= asset.size) { response.writeHead(416); response.end(); return; }
        status = 206;
      }
      response.writeHead(status, { "content-type": asset.name.endsWith(".yml") ? "text/yaml" : "application/octet-stream", "content-length": end - start + 1, "accept-ranges": "bytes", "cache-control": "no-store", ...(status === 206 ? { "content-range": `bytes ${start}-${end}/${asset.size}` } : {}) });
      if (request.method === "HEAD") response.end(); else fs.createReadStream(asset.file, { start, end }).pipe(response);
      return;
    }
    const body = route.xml ?? JSON.stringify(route.json);
    response.writeHead(200, { "content-type": route.xml ? "application/atom+xml" : "application/json", "content-length": Buffer.byteLength(body), "cache-control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : body);
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
  return server;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const [manifestPath, keyPath, certPath, requestLog] = process.argv.slice(2);
  invariant(manifestPath && keyPath && certPath && requestLog, "Usage: stable-upgrade-network.mjs manifest.json key.pem cert.pem requests.jsonl");
  await serveUpgradeNetwork({ manifestPath, keyPath, certPath, requestLog });
  process.stdout.write("VM-only exact-candidate update endpoints are ready\n");
}
