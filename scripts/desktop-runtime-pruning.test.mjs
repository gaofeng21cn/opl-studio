import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parse } from "yaml";
import { FileMatcher } from "app-builder-lib/out/fileMatcher.js";

const root = fileURLToPath(new URL("..", import.meta.url));

for (const name of ["electron-builder.yml", "electron-builder.stable.yml"]) {
  test(`${name} preserves executable YAML document modules after payload pruning`, async t => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "opl-runtime-pruning-"));
    t.after(() => fs.rm(temp, { recursive: true, force: true }));
    const config = parse(await fs.readFile(path.join(root, name), "utf8"));
    const filter = new FileMatcher(root, temp, value => value,
      ["**/*", ...config.files.filter(pattern => pattern.startsWith("!node_modules/"))]).createFilter();
    await fs.cp(path.join(root, "node_modules/yaml"), path.join(temp, "yaml"), {
      recursive: true, dereference: true,
      filter: async source => filter(source, await fs.stat(source))
    });
    const require = createRequire(path.join(temp, "package.json"));
    const yaml = require("./yaml/dist/index.js");
    assert.deepEqual(yaml.parse("plugins:\n  - codex\n"), { plugins: ["codex"] });
    for (const relative of ["node_modules/yaml/docs/guide.md", "node_modules/@example/plugin/tests/test.js"]) {
      assert.equal(filter(path.join(root, relative), { isDirectory: () => false }), false);
    }
  });
}
