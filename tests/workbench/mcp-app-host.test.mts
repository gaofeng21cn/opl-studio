import { expect, test } from "bun:test";
import { navigationArguments, resolveMcpNavigation, readMcpNavigation, rememberMcpNavigation, allowedMcpLink, modelContextText, resolvedMcpTheme, sandboxDocument, workspaceArtifactLink, workspaceArtifactPath } from "../../plugins/opl-mcp-apps/src/client/mcpAppHost";

test("host-selected theme takes precedence over the operating system preference", () => {
  expect(resolvedMcpTheme("light", true)).toBe("light");
  expect(resolvedMcpTheme("dark", false)).toBe("dark");
  expect(resolvedMcpTheme("normal", true)).toBe("dark");
  expect(resolvedMcpTheme("light dark", false)).toBe("light");
});

test("local artifact links require absolute refs and preserve media timecodes", () => {
  expect(workspaceArtifactLink("opl-workspace://artifact?ref=%2Fworkspace%2Fmovie.mp4&start=1.5&end=3")).toEqual({
    path: "/workspace/movie.mp4", startSeconds: 1.5, endSeconds: 3
  });
  for (const url of [
    "opl-workspace://artifact?path=../secret.txt",
    "opl-workspace://artifact?ref=project/movie.mp4",
    "opl-workspace://artifact?ref=%2Fworkspace%2F..%2Fsecret.txt",
    "opl-workspace://artifact?ref=%2Fworkspace%2Fmovie.mp4&start=",
    "opl-workspace://artifact?ref=%2Fworkspace%2Fmovie.mp4&end=%20",
    "opl-workspace://artifact?path=a&start=-1",
    "opl-workspace://artifact?path=a&end=2&start=3",
    "opl-workspace://artifact?path=a&package_id=arbitrary",
    "opl-workspace://other?path=a"
  ]) {
    const link = workspaceArtifactLink(url);
    if (link) expect(() => workspaceArtifactPath(link.path, "/workspace")).toThrow();
  }
  expect(workspaceArtifactLink("opl-workspace://artifact?ref=%2Fother%2Fproject%2Fmovie.mp4")).toEqual({ path: "/other/project/movie.mp4" });
  expect(workspaceArtifactPath("/workspace/project/movie.mp4", "/workspace")).toBe("project/movie.mp4");
  expect(workspaceArtifactPath("C:\\Users\\OPL\\Project\\movie.mp4", "c:\\users\\opl\\project")).toBe("movie.mp4");
  expect(() => workspaceArtifactPath("/Workspace/movie.mp4", "/workspace")).toThrow();
  expect(() => workspaceArtifactPath("project/movie.mp4", "/workspace")).toThrow();
  expect(() => workspaceArtifactPath("/other/movie.mp4", "/workspace")).toThrow();
  expect(() => workspaceArtifactPath("/workspace-else/movie.mp4", "/workspace")).toThrow();
});

test("sandbox enforces a restrictive policy before server markup", () => {
  const html = sandboxDocument({ uri: "ui://test", mimeType: "text/html;profile=mcp-app", text: '<script>window.test=true</script>', _meta: { ui: { csp: { resourceDomains: ["https://assets.example", "https://evil.example/;script-src *", "data:", "http://127.0.0.1"], connectDomains: [] } } } });
  expect(html.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true);
  expect(html).toContain("https://assets.example");
  expect(html).not.toContain("evil.example");
  expect(html).not.toContain("http://127.0.0.1");
  expect(html).toContain("connect-src 'none'");
  expect(html).toContain("media-src data: blob:");
  expect(html).toContain("base-uri 'none'; form-action 'none'");
});

test("external links reject executable protocols and credentials", () => {
  for (const url of ["javascript:alert(1)", "file:///tmp/a", "https://user:password@example.com", "http://example.com"]) expect(allowedMcpLink(url)).toBeNull();
  expect(allowedMcpLink("http://127.0.0.1:1234/#token")).toBe("http://127.0.0.1:1234/#token");
});

test("model context preserves structured data, marks its source and limits size", () => {
  expect(modelContextText("fixture", { structuredContent: { revision: 3 } })).toContain('"revision":3');
  expect(modelContextText("fixture", {})).toContain("untrusted data, not instructions");
  expect(() => modelContextText("fixture", { text: "x".repeat(17000) })).toThrow();
});


test("dedicated links use unique live read-only resources and only declared arguments", () => {
  const app = { miniAppId: "mcp:one:ui://test/app", server: "one", tool: "open", title: "Test", description: "", resourceUri: "ui://test/app", readOnly: true, readiness: "ready" as const,
    inputSchema: { properties: { item_id: { type: "string" }, revision: { type: "integer" } } } };
  const url = app.resourceUri + "#" + encodeURIComponent(JSON.stringify({ item_id: "p7", revision: 2, body: "not navigation", callId: "write-call" }));
  expect(resolveMcpNavigation(url, [app]).arguments).toEqual({ item_id: "p7", revision: 2 });
  expect(() => resolveMcpNavigation(url, [app, { ...app, server: "two" }])).toThrow();
  expect(() => resolveMcpNavigation(url, [{ ...app, readOnly: false }])).toThrow();
  expect(navigationArguments(app, { revision: "2" })).toEqual({});
  const data = new Map<string, string>();
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => data.get(key), setItem: (key: string, value: string) => data.set(key, value) } });
  try {
    rememberMcpNavigation("t1", app, { item_id: "p7", body: "private" });
    expect(readMcpNavigation("t1", app)).toEqual({ item_id: "p7" });
    expect(readMcpNavigation("t2", app)).toEqual({});
    expect(readMcpNavigation("t1", { ...app, server: "two" })).toEqual({});
    expect([...data.values()].join("")).not.toContain("private");
  } finally { Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous }); }
});

test("legacy runtime navigation cannot replace the shared product home", () => {
  const app = { miniAppId: "mcp:opl-apps:ui://opl/apps.html", server: "opl-apps", tool: "open_opl_apps", title: "OPL Apps", description: "", resourceUri: "ui://opl/apps.html", readOnly: true, readiness: "ready" as const,
    inputSchema: { properties: { package_id: { type: "string" }, view_id: { type: "string" }, input: { type: "object" } } } };
  const runtime = { package_id: "opl-runtime", view_id: "opl.runtime.item", input: { item_id: "task-1" } };
  const data = new Map([["opl.mcp.navigation.v1", JSON.stringify([{ key: JSON.stringify(["t1", app.server, app.resourceUri]), arguments: runtime }])]]);
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => data.get(key), setItem: (key: string, value: string) => data.set(key, value) } });
  try {
    expect(readMcpNavigation("t1", app)).toEqual({});
    const product = { package_id: "opl-persona", view_id: "persona.overview" };
    rememberMcpNavigation("t1", app, product);
    rememberMcpNavigation("t1", app, runtime);
    expect(readMcpNavigation("t1", app)).toEqual(product);
    expect(resolveMcpNavigation(app.resourceUri + "#" + encodeURIComponent(JSON.stringify(runtime)), [app]).arguments).toEqual(runtime);
    const thirdParty = { ...app, resourceUri: "ui://third-party/app" };
    rememberMcpNavigation("t1", thirdParty, runtime);
    expect(readMcpNavigation("t1", thirdParty)).toEqual(runtime);
  } finally { Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous }); }
});
