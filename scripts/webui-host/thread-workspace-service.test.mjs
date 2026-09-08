import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import test from "node:test";
import { ThreadAdapterError } from "./thread-adapter.mjs";
import { createThreadWorkspaceService } from "./thread-workspace-service.mjs";

async function fixture() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "opl-thread-workspace-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "opl-thread-workspace-outside-"));
  await mkdir(path.join(workspace, "nested"));
  await mkdir(path.join(workspace, ".git"));
  await mkdir(path.join(workspace, "node_modules"));
  await writeFile(path.join(workspace, "alpha.txt"), "alpha\n", "utf8");
  await writeFile(path.join(workspace, "nested", "beta.md"), "# beta\n", "utf8");
  await writeFile(path.join(workspace, ".git", "ignored.txt"), "ignored\n", "utf8");
  await writeFile(path.join(workspace, "node_modules", "ignored.js"), "ignored\n", "utf8");
  await writeFile(path.join(outside, "secret.txt"), "secret\n", "utf8");
  await symlink(path.join(workspace, "alpha.txt"), path.join(workspace, "alpha-link.txt"));
  await symlink(outside, path.join(workspace, "escape"), "dir");
  return { workspace, outside };
}

function serviceFor(workspace, options = {}) {
  const calls = [];
  const service = createThreadWorkspaceService({
    threads: {
      async readThread(request) {
        calls.push(request);
        return { id: request.threadId, cwd: workspace };
      }
    },
    ...options
  });
  return { service, calls };
}

async function removeFixture({ workspace, outside }) {
  await Promise.all([
    rm(workspace, { recursive: true, force: true }),
    rm(outside, { recursive: true, force: true })
  ]);
}

test("lists and reads a canonical thread workspace with stable typed entries", async (t) => {
  const paths = await fixture();
  t.after(() => removeFixture(paths));
  const { service, calls } = serviceFor(paths.workspace);

  const listed = await service.list({ threadId: "thread-1" });
  assert.deepEqual(listed, {
    schema: "opl_thread_workspace_listing.v1",
    threadId: "thread-1",
    relativePath: "",
    entries: [
      { name: ".git", relativePath: ".git", kind: "directory" },
      { name: "alpha-link.txt", relativePath: "alpha-link.txt", kind: "symlink" },
      { name: "alpha.txt", relativePath: "alpha.txt", kind: "file", sizeBytes: 6 },
      { name: "escape", relativePath: "escape", kind: "symlink" },
      { name: "nested", relativePath: "nested", kind: "directory" },
      { name: "node_modules", relativePath: "node_modules", kind: "directory" }
    ],
    truncated: false
  });
  const read = await service.read({ threadId: "thread-1", relativePath: "nested/beta.md" });
  assert.deepEqual(read, {
    schema: "opl_thread_workspace_file.v1",
    threadId: "thread-1",
    relativePath: "nested/beta.md",
    name: "beta.md",
    content: "# beta\n",
    sizeBytes: 7
  });
  assert.deepEqual(calls, [{ threadId: "thread-1" }, { threadId: "thread-1" }]);
});

test("rejects relative traversal, absolute paths, and NUL bytes", async (t) => {
  const paths = await fixture();
  t.after(() => removeFixture(paths));
  const { service } = serviceFor(paths.workspace);
  for (const relativePath of ["../secret.txt", "nested/../../secret.txt", "/etc/passwd", "C:\\Windows\\win.ini", "nested\0beta.md"]) {
    await assert.rejects(
      service.read({ threadId: "thread-1", relativePath }),
      (caught) => caught instanceof ThreadAdapterError
        && caught.code === "invalid_workspace_path"
        && caught.httpStatus === 400
    );
  }
});

test("rejects a symlink that resolves outside the canonical workspace", async (t) => {
  const paths = await fixture();
  t.after(() => removeFixture(paths));
  const { service } = serviceFor(paths.workspace);
  await assert.rejects(
    service.read({ threadId: "thread-1", relativePath: "escape/secret.txt" }),
    (caught) => caught instanceof ThreadAdapterError
      && caught.code === "workspace_path_outside"
      && caught.httpStatus === 403
  );
});

test("truncates directories that exceed maxEntries with a sorted bounded listing", async (t) => {
  const paths = await fixture();
  t.after(() => removeFixture(paths));
  const { service } = serviceFor(paths.workspace, { maxEntries: 2 });
  assert.deepEqual(await service.list({ threadId: "thread-1" }), {
    schema: "opl_thread_workspace_listing.v1",
    threadId: "thread-1",
    relativePath: "",
    entries: [
      { name: ".git", relativePath: ".git", kind: "directory" },
      { name: "alpha-link.txt", relativePath: "alpha-link.txt", kind: "symlink" },
    ],
    truncated: true
  });
});

test("supports a zero-entry listing limit without reading entries into the result", async (t) => {
  const paths = await fixture();
  t.after(() => removeFixture(paths));
  const { service } = serviceFor(paths.workspace, { maxEntries: 0 });
  assert.deepEqual(await service.list({ threadId: "thread-1" }), {
    schema: "opl_thread_workspace_listing.v1",
    threadId: "thread-1",
    relativePath: "",
    entries: [],
    truncated: true
  });
});

test("rejects files that exceed maxPreviewBytes", async (t) => {
  const paths = await fixture();
  t.after(() => removeFixture(paths));
  await writeFile(path.join(paths.workspace, "large.txt"), "12345", "utf8");
  const { service } = serviceFor(paths.workspace, { maxPreviewBytes: 4 });
  await assert.rejects(
    service.read({ threadId: "thread-1", relativePath: "large.txt" }),
    (caught) => caught instanceof ThreadAdapterError
      && caught.code === "workspace_file_too_large"
      && caught.httpStatus === 413
  );
});

test("rejects binary workspace files", async (t) => {
  const paths = await fixture();
  t.after(() => removeFixture(paths));
  await writeFile(path.join(paths.workspace, "image.bin"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));
  const { service } = serviceFor(paths.workspace);
  await assert.rejects(
    service.read({ threadId: "thread-1", relativePath: "image.bin" }),
    (caught) => caught instanceof ThreadAdapterError
      && caught.code === "workspace_binary_file"
      && caught.httpStatus === 415
  );
});

test("searches recursively, ignores heavy directories, and returns relative matches", async (t) => {
  const paths = await fixture();
  t.after(() => removeFixture(paths));
  const { service } = serviceFor(paths.workspace);
  const result = await service.search({ threadId: "thread-1", query: "beta" });
  assert.deepEqual(result, {
    schema: "opl_thread_workspace_search.v1",
    threadId: "thread-1",
    query: "beta",
    entries: [{ name: "beta.md", relativePath: "nested/beta.md", kind: "file", sizeBytes: 7 }],
    truncated: false
  });
  const ignored = await service.search({ threadId: "thread-1", query: "ignored" });
  assert.deepEqual(ignored.entries, []);
});

test("finds files beside an early directory that exhausts the recursive scan budget", async (t) => {
  const paths = await fixture();
  t.after(() => removeFixture(paths));
  const noisyDirectory = path.join(paths.workspace, "000-noisy");
  await mkdir(noisyDirectory);
  await Promise.all(Array.from({ length: 5_000 }, (_, index) => (
    writeFile(path.join(noisyDirectory, `entry-${String(index).padStart(4, "0")}.txt`), "x", "utf8")
  )));
  await writeFile(path.join(paths.workspace, "workspace.yaml"), "name: current\n", "utf8");

  const { service } = serviceFor(paths.workspace);
  const result = await service.search({ threadId: "thread-1", query: "workspace.yaml" });
  assert.deepEqual(result.entries, [
    { name: "workspace.yaml", relativePath: "workspace.yaml", kind: "file", sizeBytes: 14 }
  ]);
  assert.equal(result.truncated, true);
});

test("caps search results and marks the response truncated", async (t) => {
  const paths = await fixture();
  t.after(() => removeFixture(paths));
  await Promise.all(Array.from({ length: 105 }, (_, index) => (
    writeFile(path.join(paths.workspace, `match-${String(index).padStart(3, "0")}.txt`), "x", "utf8")
  )));
  const { service } = serviceFor(paths.workspace);
  const result = await service.search({ threadId: "thread-1", query: "match-" });
  assert.equal(result.entries.length, 100);
  assert.equal(result.truncated, true);
  assert.equal(result.entries[0].relativePath, "match-000.txt");
  assert.equal(result.entries.at(-1).relativePath, "match-099.txt");
});


test("workspace download preserves binary bytes and enforces size, type, and canonical path boundaries", async (t) => {
  const paths = await fixture();
  t.after(() => removeFixture(paths));
  const binary = Buffer.from([0, 255, 1, 2, 128, 0]);
  await writeFile(path.join(paths.workspace, "报告.pdf"), binary);
  await writeFile(path.join(paths.workspace, "empty.txt"), "");
  const { service } = serviceFor(paths.workspace, { maxDownloadBytes: 6 });
  for (const [relativePath, expected] of [["报告.pdf", binary], ["empty.txt", Buffer.alloc(0)]]) {
    const file = await service.download({ threadId: "thread-1", relativePath });
    try {
      const chunks = [];
      for await (const chunk of file.stream) chunks.push(chunk);
      assert.deepEqual(Buffer.concat(chunks), expected);
      assert.equal(file.sizeBytes, expected.length);
      assert.equal(file.name, relativePath);
    } finally { await file.close(); }
  }
  for (const [relativePath, code] of [
    ["../secret.txt", "invalid_workspace_path"],
    ["escape/secret.txt", "workspace_path_outside"],
    ["nested", "workspace_not_regular_file"],
    ["nested/beta.md", "workspace_file_too_large"]
  ]) {
    await assert.rejects(service.download({ threadId: "thread-1", relativePath }), (error) => error.code === code);
  }
});

test("native file access resolves documents and folders but leaves executable formats reveal-only", async (t) => {
  const paths = await fixture();
  t.after(() => removeFixture(paths));
  await writeFile(path.join(paths.workspace, "run.sh"), "echo unsafe");
  await mkdir(path.join(paths.workspace, "Runner.app"));
  const { service } = serviceFor(paths.workspace);
  const document = await service.resolveAccess({ threadId: "thread-1", relativePath: "alpha.txt", action: "open" });
  assert.equal(document.target, await realpath(path.join(paths.workspace, "alpha.txt")));
  const folder = await service.resolveAccess({ threadId: "thread-1", action: "open" });
  assert.equal(folder.target, await realpath(paths.workspace));
  for (const relativePath of ["run.sh", "Runner.app"]) {
    await assert.rejects(service.resolveAccess({ threadId: "thread-1", relativePath, action: "open" }), (error) => error.code === "workspace_open_type_unsupported");
    const revealed = await service.resolveAccess({ threadId: "thread-1", relativePath, action: "reveal" });
    assert.equal(revealed.target, await realpath(path.join(paths.workspace, relativePath)));
  }
  await assert.rejects(service.resolveAccess({ threadId: "thread-1", relativePath: "escape", action: "reveal" }), (error) => error.code === "workspace_path_outside");
  await assert.rejects(service.resolveAccess({ threadId: "thread-1", relativePath: "alpha.txt", action: "execute" }), (error) => error.code === "invalid_workspace_action");
});


test("bounded byte windows support plugin viewers without exposing paths beyond the canonical workspace", async (t) => {
  const paths = await fixture();
  t.after(() => removeFixture(paths));
  const binary = Buffer.from([0, 255, 128, 12, 0, 6]);
  await writeFile(path.join(paths.workspace, "binary.pdf"), binary);
  const { service } = serviceFor(paths.workspace);
  const window = await service.readBytes({ threadId: "thread-1", relativePath: "binary.pdf", offset: 1, length: 3 });
  assert.deepEqual(window, { data: binary.subarray(1, 4).toString("base64"), offset: 1, sizeBytes: 6, eof: false });
  const end = await service.readBytes({ threadId: "thread-1", relativePath: "binary.pdf", offset: 4, length: 512 * 1024 });
  assert.deepEqual(Buffer.from(end.data, "base64"), binary.subarray(4));
  assert.equal(end.eof, true);
  const beyond = await service.readBytes({ threadId: "thread-1", relativePath: "binary.pdf", offset: 50, length: 1 });
  assert.equal(beyond.data, "");
  assert.equal(beyond.eof, true);
  for (const range of [{offset:-1}, {offset:0.5}, {length:0}, {length:512*1024+1}]) {
    await assert.rejects(service.readBytes({ threadId: "thread-1", relativePath: "binary.pdf", ...range }), (error) => error.code === "invalid_workspace_range");
  }
  await assert.rejects(service.readBytes({ threadId: "thread-1", relativePath: "escape/secret.txt" }), (error) => error.code === "workspace_path_outside");
});
