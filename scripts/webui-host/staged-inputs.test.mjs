import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { access, mkdtemp, mkdir, utimes, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import test from "node:test";
import { createStagedInputService, MAX_STAGED_FILE_BYTES } from "./staged-inputs.mjs";

test("staged inputs preserve directory paths and reject traversal and duplicate writes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "opl-staged-inputs-"));
  const service = await createStagedInputService({ root });
  const group = await service.create({ kind: "directory" });
  await service.put(group.id, "project/docs/readme.md", Readable.from(["hello"]));
  await assert.rejects(
    service.put(group.id, "project/docs/readme.md", Readable.from(["again"])),
    (error) => error.code === "upload_path_exists"
  );
  const completed = await service.complete(group.id);
  assert.deepEqual(completed.inputs.map((input) => [input.kind, input.name]), [["folder", "project"]]);
  assert.equal(completed.inputs[0].path, path.join(root, group.id, "project"));

  const traversal = await service.create({ kind: "files" });
  await assert.rejects(
    service.put(traversal.id, "../outside.txt", Readable.from(["no"])),
    (error) => error.code === "invalid_upload_path"
  );
});
test("oversized upload removes its staging group", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "opl-staged-limit-"));
  const service = await createStagedInputService({ root });
  const group = await service.create({ kind: "files" });
  await assert.rejects(
    service.put(group.id, "large.bin", Readable.from([Buffer.alloc(MAX_STAGED_FILE_BYTES), Buffer.from([0])])),
    (error) => error.code === "upload_too_large"
  );
  await assert.rejects(access(path.join(root, group.id)));
});

test("startup removes staging directories older than 24 hours", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "opl-staged-orphan-"));
  const orphan = path.join(root, "old-upload");
  await mkdir(orphan);
  await writeFile(path.join(orphan, "file.txt"), "old");
  const old = new Date(Date.now() - 25 * 60 * 60 * 1_000);
  await utimes(orphan, old, old);
  await createStagedInputService({ root });
  await assert.rejects(access(orphan));
});
