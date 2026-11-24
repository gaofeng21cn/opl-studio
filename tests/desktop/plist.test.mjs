import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { build as buildPlist, buildBinary as buildBinaryPlist } from "plist";

import { parsePlistDocument, readPlistFile, readPlistKey } from "../../scripts/desktop/plist.mjs";
import { verifyPreviewIdentity } from "../../scripts/desktop/preview-smoke.mjs";

test("plist helper parses XML and binary bplist00 documents cleanly", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "opl-studio-plist-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const sample = {
    CFBundleDisplayName: "One Person Lab Preview",
    CFBundleIdentifier: "cn.onepersonlab.opl.studio.preview",
    CFBundleShortVersionString: "0.1.19",
    Format: "ULFO"
  };

  const xmlText = buildPlist(sample);
  assert.deepEqual(parsePlistDocument(xmlText), sample);

  const xmlPath = path.join(dir, "xml.plist");
  await writeFile(xmlPath, xmlText, "utf8");
  assert.deepEqual(readPlistFile(xmlPath), sample);
  assert.equal(readPlistKey(xmlPath, "Format"), "ULFO");
  assert.equal(readPlistKey(xmlPath, "MissingKey", { allowFailure: true }), null);
  assert.throws(() => readPlistKey(xmlPath, "MissingKey"), /missing plist key/);

  const binaryBytes = Buffer.from(buildBinaryPlist(sample));
  const binaryPath = path.join(dir, "bin.plist");
  await writeFile(binaryPath, binaryBytes);
  assert.deepEqual(readPlistFile(binaryPath), sample);
  assert.equal(readPlistKey(binaryPath, "CFBundleShortVersionString"), "0.1.19");

  const appDir = path.join(dir, "One Person Lab Preview.app");
  await mkdir(path.join(appDir, "Contents"), { recursive: true });
  await writeFile(path.join(appDir, "Contents", "Info.plist"), xmlText, "utf8");
  const identity = await verifyPreviewIdentity({ appPath: appDir });
  assert.equal(identity.status, "passed");
  assert.equal(identity.actual.productName, "One Person Lab Preview");
  assert.equal(identity.actual.bundleId, "cn.onepersonlab.opl.studio.preview");
});
