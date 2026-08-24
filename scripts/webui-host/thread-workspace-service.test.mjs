import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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
