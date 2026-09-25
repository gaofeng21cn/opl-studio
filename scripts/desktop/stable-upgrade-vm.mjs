import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluatePage, waitForPageTarget } from "./cdp.mjs";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quote = (value) => `'${String(value).replaceAll("'", "'\"'\"'")}'`;
function invariant(condition, message) { if (!condition) throw new Error(message); }
function run(command, args, allowFailure = false) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  if (!allowFailure && result.status !== 0) throw new Error(`${command} failed: ${result.stderr.slice(-2000)}`);
  return result;
}

export function aionInvokeExpression(method, data = {}) {
  invariant(["auto-update.check", "auto-update.get-status-snapshot", "auto-update.download", "auto-update.quit-and-install"].includes(method), "Unsupported legacy upgrade method");
  return `(new Promise((resolve,reject)=>{const name=${JSON.stringify(method)},id='opl-upgrade-'+crypto.randomUUID();let unsubscribe;const timer=setTimeout(()=>{unsubscribe?.();reject(new Error('legacy update IPC timed out'));},60000);unsubscribe=window.electronAPI.on(({value})=>{const message=typeof value==='string'?JSON.parse(value):value;if(message.name==='subscribe.callback-'+name+id){clearTimeout(timer);unsubscribe?.();resolve(message.data);}});window.electronAPI.emit('subscribe-'+name,{id,data:${JSON.stringify(data)}}).catch(reject);}))`;
}

export function parseUpgradeVmArgs(argv) {
  const values = { timeoutMs: 900_000, cdpPort: 19339, user: "admin", networkMode: "controlled_exact_candidate" };
  const keys = { "--vm": "vm", "--route": "route", "--ssh-key": "sshKey", "--user": "user", "--target-version": "targetVersion", "--preview-target-version": "previewTargetVersion", "--out": "out", "--cdp-port": "cdpPort", "--timeout-ms": "timeoutMs", "--network-mode": "networkMode" };
  for (let i = 0; i < argv.length; i++) { invariant(keys[argv[i]] && argv[i + 1], `Invalid argument ${argv[i]}`); const field = keys[argv[i]]; values[field] = ["timeoutMs", "cdpPort"].includes(field) ? Number(argv[++i]) : argv[++i]; }
  invariant(/^opl-studio-cutover-[a-z0-9-]+$/.test(values.vm ?? ""), "Only task-owned isolated upgrade VMs are permitted");
  invariant(["aion", "preview"].includes(values.route), "Upgrade route must be aion or preview");
  invariant(values.sshKey && values.out && /^\d+\.\d+\.\d+$/.test(values.targetVersion ?? ""), "SSH key, receipt and exact target version are required");
  invariant(values.route !== "preview" || /^\d+\.\d+\.\d+$/.test(values.previewTargetVersion ?? ""), "Preview route requires exact terminal bridge version");
  invariant(["controlled_exact_candidate", "public"].includes(values.networkMode), "Invalid qualification network mode");
  return values;
}

export async function qualifyUpgradeVm(options) {
  const ip = run("tart", ["ip", options.vm]).stdout.trim();
  invariant(/^192\.168\.64\.\d+$/.test(ip), "Upgrade VM is not on the isolated Tart network");
  const sshBase = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "IdentitiesOnly=yes", "-i", options.sshKey];
  const guest = (command, allowFailure = false) => run("ssh", [...sshBase, `${options.user}@${ip}`, command], allowFailure);
  const product = options.route === "aion" ? "One Person Lab" : "One Person Lab Preview";
  const sourceBundle = `/Applications/${product}.app`;
  const stableBundle = "/Applications/One Person Lab.app";
  const plistVersion = (bundle) => guest(`/usr/bin/plutil -extract CFBundleShortVersionString raw -o - ${quote(`${bundle}/Contents/Info.plist`)}`, true).stdout.trim();
  const baseVersion = plistVersion(sourceBundle);
  invariant(baseVersion, "Signed baseline is not installed in the test VM");
  const baseSignature = guest(`/usr/bin/codesign --verify --deep --strict ${quote(sourceBundle)} && /usr/bin/codesign -dvv ${quote(sourceBundle)} 2>&1`).stdout;
  invariant(baseSignature.includes("TeamIdentifier=SVVC4TA784"), "Baseline publisher does not match OPL");
  const receipt = { schema: "opl_studio_shell_upgrade_vm.v1", status: "failed", route: options.route, vm: options.vm, networkMode: options.networkMode, baselineVersion: baseVersion, targetVersion: options.targetVersion, originalSignedBaselineUsed: true, userHostMutation: false, checks: {} };
  let tunnel;
  try {
    guest(`test ! -e /tmp/opl-cutover-active-run && touch /tmp/opl-cutover-active-run`);
    if (options.networkMode === "controlled_exact_candidate") guest("test -f /tmp/cert.pem && /usr/bin/curl -fsS https://github.com/gaofeng21cn/one-person-lab-app/releases/latest >/dev/null");
    const variables = { ...(options.networkMode === "controlled_exact_candidate" ? { NODE_EXTRA_CA_CERTS: "/tmp/cert.pem" } : {}), ...(options.launchEnvironment ?? {}) };
    invariant(Object.keys(variables).every((key) => ["NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "OPL_CODEX_BIN", "OPL_SOURCE_ARCHIVE_URL", "OPL_FRAMEWORK_SOURCE_COMMIT", "OPL_NATIVE_WORKBENCH_READ_ONLY"].includes(key)), "Unexpected guest launch environment");
    const trustEnvironment = `env ${Object.entries(variables).map(([key, value]) => `${key}=${quote(value)}`).join(" ")} `;
    guest(`nohup ${trustEnvironment}${quote(`${sourceBundle}/Contents/MacOS/${product}`)} --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 >/tmp/opl-upgrade-app.log 2>&1 & echo $!`);
    tunnel = spawn("ssh", [...sshBase, "-N", "-L", `${options.cdpPort}:127.0.0.1:9222`, `${options.user}@${ip}`], { stdio: "ignore" });
    await waitForPageTarget({ port: options.cdpPort, timeoutMs: 120_000 });
    const evaluate = (expression) => evaluatePage({ port: options.cdpPort, expression, timeoutMs: 90_000 });
    if (options.verifyBaseline) receipt.checks.baselineReadiness = await options.verifyBaseline();
    if (options.route === "preview") {
      const sentinel = { "opl.studio.settings.v1": JSON.stringify({ locale: "en", theme: "dark", fontSize: 15 }), "opl.studio.drafts.v2": JSON.stringify({ prompts: { "opl-upgrade-sentinel": "Preserve this offline draft during the Studio transition." } }) };
      await evaluate(`(()=>{const storage=${JSON.stringify(sentinel)};for(const [key,value] of Object.entries(storage))localStorage.setItem(key,value);return true;})()`);
      receipt.checks.previewStorageSeeded = true;
      const result = await evaluate("window.oplStudio.checkNativeAppUpdate()");
      invariant(result.targetVersion === options.previewTargetVersion, "Preview updater did not select the exact terminal bridge");
      receipt.checks.updateSelected = { version: result.targetVersion };
      if (result.state === "available") await evaluate("window.oplStudio.applyNativeAppUpdate()");
    } else {
      const result = await evaluate(aionInvokeExpression("auto-update.check", { channel: "stable", includeNightly: false }));
      invariant(result?.success === true && result?.data?.target?.updaterVersion === options.targetVersion, "Legacy updater did not select the exact Studio Stable release");
      receipt.checks.updateSelected = result.data.target;
      const download = await evaluate(aionInvokeExpression("auto-update.download", result.data.target));
      invariant(download?.success === true, "Legacy updater rejected candidate download");
    }
    const deadline = Date.now() + options.timeoutMs;
    let downloaded = false;
    while (Date.now() < deadline) {
      const status = await evaluate(options.route === "preview" ? "window.oplStudio.readNativeAppUpdateStatus()" : aionInvokeExpression("auto-update.get-status-snapshot"));
      if (status?.state === "downloaded" || status?.status === "downloaded") { downloaded = true; receipt.checks.downloaded = status; break; }
      invariant(status?.state !== "error" && status?.status !== "error", "Updater reported a download error");
      await pause(1500);
    }
    invariant(downloaded, "Updater download did not finish");
    // Invoke the production restart action, then observe its on-disk replacement.
    if (options.route === "preview") await evaluate("window.oplStudio.restartNativeApp()").catch(() => {});
    else await evaluate(aionInvokeExpression("auto-update.quit-and-install", {})).catch(() => {});
    while (Date.now() < deadline && plistVersion(stableBundle) !== options.targetVersion) await pause(1500);
    invariant(plistVersion(stableBundle) === options.targetVersion, "Squirrel replacement or Preview handoff did not install exact Studio Stable");
    guest(`/usr/bin/codesign --verify --deep --strict ${quote(stableBundle)} && /usr/bin/codesign --verify -R '=identifier "cn.onepersonlab.opl" and anchor apple generic and certificate leaf[subject.OU] = "SVVC4TA784"' ${quote(stableBundle)} && /usr/sbin/spctl --assess --type execute ${quote(stableBundle)}`);
    receipt.checks.installedIdentity = { version: options.targetVersion, bundleId: "cn.onepersonlab.opl", teamId: "SVVC4TA784", signatureVerified: true, gatekeeperAccepted: true };
    await pause(3000);
    guest("pkill -TERM -f '^/Applications/One Person Lab.app/Contents/MacOS/One Person Lab( |$)'", true);
    await pause(2000);
    guest(`nohup ${trustEnvironment}${quote(`${stableBundle}/Contents/MacOS/One Person Lab`)} --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 >/tmp/opl-upgrade-stable.log 2>&1 & echo $!`);
    await waitForPageTarget({ port: options.cdpPort, timeoutMs: 120_000 });
    const readback = await evaluate(`(async()=>{const status=await window.oplStudio.readNativeAppUpdateStatus();return {status,bridge:typeof window.oplStudio.readState==='function',draft:localStorage.getItem('opl.studio.drafts.v2'),settings:localStorage.getItem('opl.studio.settings.v1')};})()`);
    invariant(readback.bridge && readback.status?.currentVersion === options.targetVersion, "Relaunched Studio did not report the installed version");
    if (options.route === "preview") {
      invariant(JSON.parse(readback.draft ?? "{}").prompts?.["opl-upgrade-sentinel"] === "Preserve this offline draft during the Studio transition.", "Preview draft did not survive handoff");
      const settings = JSON.parse(readback.settings ?? "{}");
      invariant(settings.locale === "en" && settings.theme === "dark" && settings.fontSize === 15, "Preview settings did not survive handoff");
      receipt.checks.previewShellStoragePreserved = true;
    }
    receipt.checks.runtimeVersion = readback.status.currentVersion;
    if (options.verifyTarget) receipt.checks.targetReadiness = await options.verifyTarget({ evaluate, guest });
    receipt.status = "passed";
  } catch (error) { receipt.failure = { message: error.message }; }
  finally {
    tunnel?.kill("SIGTERM");
    guest("rm -f /tmp/opl-cutover-active-run", true);
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  return receipt;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const receipt = await qualifyUpgradeVm(parseUpgradeVmArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (receipt.status !== "passed") process.exitCode = 1;
}
