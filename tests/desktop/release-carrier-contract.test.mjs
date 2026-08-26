import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("Studio declares one branded preview carrier for the App-owned desktop release kernel", async () => {
  const carrier = JSON.parse(await readFile(path.join(root, "contracts/desktop-release-carrier.json"), "utf8"));
  const full = JSON.parse(await readFile(path.join(root, "contracts/full-payload-carrier.json"), "utf8"));
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const builder = parseYaml(await readFile(path.join(root, "electron-builder.yml"), "utf8"));

  assert.deepEqual(
    {
      schema: carrier.schema,
      owner_repo: carrier.owner_repo,
      carrier_id: carrier.carrier_id,
      product_name: carrier.product_name,
      bundle_id: carrier.bundle_id,
      release_role: carrier.release_role,
      release_repository: carrier.release_repository,
      package_manager: carrier.package_manager,
      artifact_name_template: carrier.artifact_name_template,
      entitlements: carrier.entitlements
    },
    {
      schema: "opl_app_desktop_release_carrier.v1",
      owner_repo: "gaofeng21cn/opl-studio",
      carrier_id: "opl-studio",
      product_name: "One Person Lab Preview",
      bundle_id: "cn.onepersonlab.opl.studio.preview",
      release_role: "candidate_preview",
      release_repository: "gaofeng21cn/opl-studio",
      package_manager: "npm",
      artifact_name_template: "one-person-lab-preview-${version}-${os}-${arch}.${ext}",
      entitlements: null
    }
  );
  assert.equal(pkg.dependencies["electron-updater"], "6.8.9");
  assert.equal(pkg.devDependencies.electron, "43.4.0");
  assert.equal(pkg.devDependencies["electron-builder"], "26.15.3");
  assert.equal(builder.appId, carrier.bundle_id);
  assert.equal(builder.productName, carrier.product_name);
  assert.deepEqual(builder.mac.target, ["dmg", "zip"]);
  assert.equal(builder.mac.hardenedRuntime, true);
  assert.equal(builder.artifactName, carrier.artifact_name_template);
  assert.equal(builder.dmg.format, "ULFO");
  assert.deepEqual(builder.extraResources.find((entry) => entry.to === "opl-framework-bootstrap"), {
    from: "resources/opl-framework-bootstrap",
    to: "opl-framework-bootstrap",
    filter: ["opl-install.sh", "manifest.json"]
  });
  assert.equal(`${builder.publish.owner}/${builder.publish.repo}`, carrier.release_repository);
  assert.equal(
    carrier.commands.qualify_public_release,
    "node scripts/desktop/macos-distribution.mjs --require-release-trust --require-public-feed"
  );
  assert.equal(carrier.full_payload_contract, "contracts/full-payload-carrier.json");
  assert.equal(carrier.full_package_kind, full.full_package_kind);
  assert.equal(carrier.full_artifact_name_template, full.full_artifact_template);
  assert.equal(full.runtime_boundary.codex_runtime_owner, "opl-codex-native");
  assert.equal(full.runtime_boundary.framework_managed_codex_payload_in_app_bundle_allowed, false);
  assert.equal(full.full_append_policy.same_tag, true);
  assert.equal(full.full_append_policy.standard_assets_immutable, true);
});
