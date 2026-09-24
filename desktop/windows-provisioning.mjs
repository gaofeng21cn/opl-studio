import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { verifyGuestPayloadFiles } from "./windows-guest-proxy.mjs";
import { validateWindowsRuntimeIdentity } from "./windows-runtime.mjs";

const fail = (code, restartRequired = false) => Object.assign(new Error(`OPL Windows setup requires attention (${code}).`), { code, restartRequired });
const decode = chunks => {
  const buffer = Buffer.concat(chunks);
  return (buffer.includes(0) ? buffer.toString("utf16le") : buffer.toString("utf8")).replace(/^\uFEFF/, "");
};

export function createWindowsProvisioner({ userDataPath, resourcesPath, env = process.env, spawnImpl = spawn,
  onProgress = () => {}, resumeExecutable, platform = process.platform, verifyPayload = verifyGuestPayloadFiles } = {}) {
  if (platform !== "win32") throw fail("wsl_wrong_host");
  const system = env.SystemRoot ?? env.SYSTEMROOT ?? "C:\\Windows";
  const wsl = path.win32.join(system, "System32/wsl.exe");
  const powershell = path.win32.join(system, "System32/WindowsPowerShell/v1.0/powershell.exe");
  const installRoot = path.win32.join(userDataPath, "wsl", "OPL-Linux");
  const guest = (args, user = "opl") => ["--distribution", "OPL-Linux", "--user", user, "--exec", ...args];
  const run = (command, args, { stage = "checking_host", timeoutMs = 1200000, extraEnv = {} } = {}) => new Promise(resolve => {
    const started = Date.now();
    onProgress({ stage, elapsedSeconds: 0 });
    const heartbeat = setInterval(() => onProgress({ stage, elapsedSeconds: Math.floor((Date.now() - started) / 1000), heartbeat: true }), 15000);
    const child = spawnImpl(command, args, { env: { ...env, ...extraEnv }, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [], stderr = [];
    let settled = false, timedOut = false, size = 0;
    const finish = code => { if (settled) return; settled = true; clearInterval(heartbeat); clearTimeout(timer); resolve({ exitCode: code ?? -1, stdout: decode(stdout), stderr: decode(stderr), timedOut }); };
    const capture = (into, chunk) => { size += chunk.length; if (size <= 4 * 1024 * 1024) into.push(Buffer.from(chunk)); };
    child.stdout.on("data", chunk => capture(stdout, chunk)); child.stderr.on("data", chunk => capture(stderr, chunk));
    child.once("error", () => finish(-1)); child.once("close", finish);
    const timer = setTimeout(() => { timedOut = true; child.kill(); finish(-1); }, timeoutMs);
  });
  const ps = (script, options) => run(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], options);
  const successful = (result, code) => { if (result.exitCode !== 0 || result.timedOut) throw fail(code); return result; };
  const registry = async () => {
    const result = await ps("$ErrorActionPreference='Stop';[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);$root='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss';$entry=Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath } | Where-Object { $_.DistributionName -eq 'OPL-Linux' };if($null -eq $entry){exit 3};if(@($entry).Count -ne 1){exit 4};[pscustomobject]@{name=$entry.DistributionName;basePath=$entry.BasePath;version=$entry.Version}|ConvertTo-Json -Compress");
    if (result.exitCode === 3) return null;
    successful(result, "wsl_registry_unavailable");
    let entry; try { entry = JSON.parse(result.stdout); } catch { throw fail("wsl_registry_invalid"); }
    const normalized = value => path.win32.normalize(value).replace(/^\\\\\?\\/, "").replace(/[\\/]+$/, "").toLowerCase();
    if (entry.name !== "OPL-Linux" || typeof entry.basePath !== "string" || normalized(entry.basePath) !== normalized(installRoot) || entry.version !== 2) throw fail("wsl_foreign_distribution");
    return entry;
  };
  return {
    async ensureReady() {
      const payload = path.join(resourcesPath, "opl-wsl-host");
      const manifest = JSON.parse(fs.readFileSync(path.join(payload, "manifest.json"), "utf8"));
      if (!manifest.bootstrap || !/^[0-9a-f]{40}$/.test(manifest.bootstrap.framework_ref)) throw fail("wsl_bootstrap_payload_unavailable");
      verifyPayload(payload, manifest);
      let status = await run(wsl, ["--status"], { timeoutMs: 30000 });
      if (status.exitCode !== 0 || status.timedOut) {
        if (resumeExecutable) successful(await ps("$ErrorActionPreference='Stop';$path='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce';New-Item -Path $path -Force|Out-Null;New-ItemProperty -Path $path -Name 'OnePersonLabSetup' -PropertyType String -Value ('\"'+$env:OPL_SETUP_RESUME_EXE+'\"') -Force|Out-Null", { extraEnv: { OPL_SETUP_RESUME_EXE: resumeExecutable } }), "wsl_resume_registration_failed");
        const enable = await ps("$ErrorActionPreference='Stop';$wsl=Join-Path $env:SystemRoot 'System32\\wsl.exe';$process=Start-Process -FilePath $wsl -ArgumentList @('--install','--no-distribution') -Verb RunAs -Wait -PassThru;exit $process.ExitCode", { stage: "enabling_wsl" });
        successful(enable, "wsl_enablement_failed_or_uac_denied");
        status = await run(wsl, ["--status"], { timeoutMs: 30000 });
        if (status.exitCode !== 0 || status.timedOut) throw fail("wsl_restart_required", true);
      }
      if (!await registry()) {
        fs.mkdirSync(path.dirname(installRoot), { recursive: true });
        successful(await run(wsl, ["--install", "Ubuntu-24.04", "--name", "OPL-Linux", "--location", installRoot,
          "--no-launch", "--version", "2", "--web-download"], { stage: "installing_owned_distribution" }), "wsl_distribution_install_failed");
        if (!await registry()) throw fail("wsl_distribution_registration_missing");
      }
      const translated = successful(await run(wsl, guest(["/usr/bin/wslpath", "-a", "-u", payload], "root")), "wsl_bootstrap_path_projection_failed").stdout.trim();
      if (!translated.startsWith("/mnt/") || /[\r\n\0]/.test(translated)) throw fail("wsl_bootstrap_path_invalid");
      const result = await run(wsl, guest(["/bin/bash", `${translated}/desktop/windows-bootstrap.sh`, translated], "root"), { stage: "initializing_guest" });
      if (result.exitCode !== 0 || result.timedOut) {
        const diagnostics = `${result.stderr}\n${result.stdout}`;
        throw fail(/Temporary failure resolving|Could not resolve/i.test(diagnostics) ? "wsl_guest_dns_unavailable"
          : /Failed to fetch|Could not connect|Connection timed out/i.test(diagnostics) ? "wsl_guest_network_unavailable" : "wsl_guest_bootstrap_failed");
      }
      const inspected = successful(await run(wsl, guest(["/usr/local/bin/node", "/opt/opl/studio-bootstrap/inspect.mjs", "--json"]), { stage: "validating_routes" }), "wsl_new_guest_inspection_failed");
      const identity = validateWindowsRuntimeIdentity(JSON.parse(inspected.stdout));
      const receiptRoot = path.join(userDataPath, "installer", "receipts"); fs.mkdirSync(receiptRoot, { recursive: true });
      const target = path.join(receiptRoot, "windows-wsl2-ready.json");
      const bytes = JSON.stringify({ schema: "opl_windows_wsl2_provisioning_receipt.v1", status: "ready", observed_at: new Date().toISOString(), distribution: "OPL-Linux", identity }) + "\n";
      fs.writeFileSync(`${target}.pending`, bytes, { mode: 0o600 }); fs.renameSync(`${target}.pending`, target);
      fs.writeFileSync(`${target}.sha256`, crypto.createHash("sha256").update(bytes).digest("hex") + "  windows-wsl2-ready.json\n");
      onProgress({ stage: "ready" });
      return identity;
    }
  };
}
