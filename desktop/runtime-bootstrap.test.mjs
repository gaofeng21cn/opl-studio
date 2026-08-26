import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { activateInstalledStudioRuntime, ensureStudioDesktopRuntime } from "./runtime-bootstrap.mjs";

function createPayload(root, overrides = {}) {
  const resourcesPath = path.join(root, "Resources");
  const resourceRoot = path.join(resourcesPath, "opl-studio-full-runtime");
  const runtime = path.join(resourceRoot, "runtime", "current");
  fs.mkdirSync(path.join(resourceRoot, "manifest"), { recursive: true });
  fs.mkdirSync(path.join(runtime, "bin"), { recursive: true });
  fs.mkdirSync(path.join(runtime, "opl"), { recursive: true });
  fs.writeFileSync(path.join(runtime, "bin", "opl"), "#!/bin/sh\nexit 0\n");
  fs.chmodSync(path.join(runtime, "bin", "opl"), 0o755);
  fs.writeFileSync(path.join(runtime, "opl", "package.json"), JSON.stringify({ name: "opl-framework" }));
  fs.writeFileSync(path.join(resourceRoot, "manifest", "full-package-manifest.json"), JSON.stringify({
    version: "0.2.0",
    carrier: {
      schema: "opl_app_full_payload_carrier_profile.v1",
      carrier_id: "opl-studio",
      runtime_resource_dir: "opl-studio-full-runtime",
      runtime_install_root_template: "~/Library/Application Support/opl-studio/runtime/current",
      codex_carrier: "opl_codex_native",
      full_runtime_codex_payload_allowed: false,
      ...overrides
    }
  }));
  return resourcesPath;
}

function createStandardBootstrap(root, { frameworkRef = "a".repeat(40), installerBody } = {}) {
  const resourcesPath = path.join(root, "Resources");
  const resourceRoot = path.join(resourcesPath, "opl-framework-bootstrap");
  const installerPath = path.join(resourceRoot, "opl-install.sh");
  const body = installerBody ?? "#!/bin/bash\nexit 0\n";
  fs.mkdirSync(resourceRoot, { recursive: true });
  fs.writeFileSync(installerPath, body, { mode: 0o755 });
  const digest = crypto.createHash("sha256").update(body).digest("hex");
  fs.writeFileSync(path.join(resourceRoot, "manifest.json"), JSON.stringify({
    schema: "opl_studio_standard_framework_bootstrap.v1",
    framework_ref: frameworkRef,
    installer_url: `https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/${frameworkRef}/install.sh`,
    archive_url: `https://github.com/gaofeng21cn/one-person-lab/archive/${frameworkRef}.tar.gz`,
    installer_path: "resources/opl-framework-bootstrap/opl-install.sh",
    installer_sha256: digest,
    installer_size_bytes: Buffer.byteLength(body),
    source: "one-person-lab-app/scripts/prepare-standard-release-payload.ts",
    active_shell_adopted: false,
    aionui_standard_payload_preparation: false
  }));
  return resourcesPath;
}

function createInstalledFramework(homeDir, frameworkRef) {
  const frameworkRoot = path.join(homeDir, ".opl", "one-person-lab");
  const carrier = path.join(homeDir, ".local", "bin", "opl");
  fs.mkdirSync(frameworkRoot, { recursive: true });
  fs.mkdirSync(path.dirname(carrier), { recursive: true });
  fs.writeFileSync(path.join(frameworkRoot, "package.json"), JSON.stringify({ name: "opl-framework" }));
  fs.writeFileSync(path.join(frameworkRoot, ".opl-framework-installed-source-identity.json"), JSON.stringify({
    schema: "opl_framework_installed_source_identity.v1",
    framework_sha: frameworkRef,
    install_mode: "archive",
    identity_source: "install_ref"
  }));
  fs.writeFileSync(carrier, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
}

test("packaged Full runtime installs into the Studio carrier root and binds the Host environment", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-studio-runtime-test-"));
  const homeDir = path.join(root, "home");
  const resourcesPath = createPayload(root);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = await ensureStudioDesktopRuntime({
    isPackaged: true,
    resourcesPath,
    homeDir,
    env: { PATH: "/usr/bin", PRESERVED: "yes" },
    platform: "linux"
  });
  const installed = path.join(homeDir, "Library", "Application Support", "opl-studio", "runtime", "current");
  assert.equal(result.runtimeHome, installed);
  assert.equal(result.source, "packaged_payload");
  assert.equal(result.env.OPL_APP_OPL_BIN, path.join(installed, "bin", "opl"));
  assert.equal(result.env.OPL_FRAMEWORK_PACKAGE_ROOT, path.join(installed, "opl"));
  assert.equal(result.env.OPL_PACKAGED_SKILLS_ROOT, path.join(installed, "skills"));
  assert.equal(result.env.PRESERVED, "yes");
  assert.equal(result.env.PATH.split(path.delimiter)[0], path.join(installed, "bin"));
  assert.equal(JSON.parse(fs.readFileSync(path.join(installed, ".opl-studio-full-runtime-installed.json"))).version, "0.2.0");
  assert.equal(JSON.parse(fs.readFileSync(path.join(path.dirname(installed), "current.json"))).runtime_home, installed);

  const restored = activateInstalledStudioRuntime({ homeDir, env: { PATH: "/bin" } });
  assert.equal(restored.source, "installed_runtime");
  assert.equal(restored.env.OPL_APP_OPL_BIN, path.join(installed, "bin", "opl"));
});

test("packaged Full runtime rejects a carrier manifest that can embed a second Codex payload", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-studio-runtime-contract-test-"));
  const resourcesPath = createPayload(root, { full_runtime_codex_payload_allowed: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await assert.rejects(
    ensureStudioDesktopRuntime({
      isPackaged: true,
      resourcesPath,
      homeDir: path.join(root, "home"),
      env: { PATH: "/usr/bin" },
      platform: "linux"
    }),
    /carrier manifest/
  );
});

test("packaged Standard reuses the exact installed Framework identity without rerunning its installer", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-studio-standard-runtime-test-"));
  const homeDir = path.join(root, "home");
  const frameworkRef = "b".repeat(40);
  const resourcesPath = createStandardBootstrap(root, {
    frameworkRef,
    installerBody: "#!/bin/bash\necho unexpected-installer-run >&2\nexit 91\n"
  });
  createInstalledFramework(homeDir, frameworkRef);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = await ensureStudioDesktopRuntime({
    isPackaged: true,
    resourcesPath,
    homeDir,
    env: { PATH: "/usr/bin", PRESERVED: "yes" },
    platform: "linux"
  });

  assert.equal(result.source, "packaged_standard_bootstrap");
  assert.equal(result.version, frameworkRef);
  assert.equal(result.env.OPL_APP_OPL_BIN, path.join(homeDir, ".local", "bin", "opl"));
  assert.equal(result.env.OPL_FRAMEWORK_PACKAGE_ROOT, path.join(homeDir, ".opl", "one-person-lab"));
  assert.equal(result.env.PRESERVED, "yes");
});

test("packaged Standard runs the App-owned installer and requires exact installed identity readback", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-studio-standard-bootstrap-test-"));
  const homeDir = path.join(root, "home");
  const frameworkRef = "c".repeat(40);
  const installerBody = `#!/bin/bash
set -euo pipefail
mkdir -p "$HOME/.opl/one-person-lab" "$HOME/.local/bin"
printf '{"name":"opl-framework"}\n' > "$HOME/.opl/one-person-lab/package.json"
printf '{"schema":"opl_framework_installed_source_identity.v1","framework_sha":"${frameworkRef}","install_mode":"archive","identity_source":"install_ref"}\n' > "$HOME/.opl/one-person-lab/.opl-framework-installed-source-identity.json"
printf '#!/bin/sh\\nexit 0\\n' > "$HOME/.local/bin/opl"
chmod +x "$HOME/.local/bin/opl"
`;
  const resourcesPath = createStandardBootstrap(root, { frameworkRef, installerBody });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = await ensureStudioDesktopRuntime({
    isPackaged: true,
    resourcesPath,
    homeDir,
    env: { PATH: "/usr/bin:/bin" },
    platform: "linux"
  });

  assert.equal(result.source, "packaged_standard_bootstrap");
  assert.equal(result.version, frameworkRef);
  assert.equal(result.env.OPL_APP_OPL_BIN, path.join(homeDir, ".local", "bin", "opl"));
});

test("packaged Standard rejects installer byte drift before execution", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-studio-standard-contract-test-"));
  const resourcesPath = createStandardBootstrap(root);
  fs.appendFileSync(path.join(resourcesPath, "opl-framework-bootstrap", "opl-install.sh"), "# drift\n");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  await assert.rejects(
    ensureStudioDesktopRuntime({
      isPackaged: true,
      resourcesPath,
      homeDir: path.join(root, "home"),
      env: { PATH: "/usr/bin" },
      platform: "linux"
    }),
    /does not match its App-owned manifest/
  );
});
