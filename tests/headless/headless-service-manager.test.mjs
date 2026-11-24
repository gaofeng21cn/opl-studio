import assert from "node:assert/strict";
import test from "node:test";
import { parse as parsePlist } from "plist";

import {
  createHeadlessServiceManager,
  restartLoadedHeadlessService
} from "../../scripts/headless/service-manager.mjs";

function harness(platform, overrides = {}) {
  const calls = [];
  const files = [];
  const manager = createHeadlessServiceManager({
    platform,
    homeDirectory: platform === "win32" ? "C:\\Users\\opl" : "/home/opl",
    uid: platform === "win32" ? undefined : 1001,
    nodeExecutable: platform === "win32" ? "C:\\Program Files\\nodejs\\node.exe" : "/usr/bin/node",
    headlessEntry: platform === "win32"
      ? "C:\\Program Files\\One Person Lab\\scripts\\headless\\run.mjs"
      : "/opt/one-person-lab/scripts/headless/run.mjs",
    execute: async (command, args, options) => {
      calls.push({ command, args, options });
      return { exitCode: 0, stdout: "active", stderr: "" };
    },
    fileSystem: {
      mkdir: async (target, options) => files.push({ operation: "mkdir", target, options }),
      writeFile: async (target, contents, options) => files.push({ operation: "writeFile", target, contents, options }),
      rm: async (target, options) => files.push({ operation: "rm", target, options })
    },
    ...overrides
  });
  return { manager, calls, files };
}

function assertNoShell(calls) {
  assert.ok(calls.length > 0);
  for (const call of calls) {
    assert.equal(call.options.shell, false);
    assert.ok(Array.isArray(call.args));
    assert.ok(call.args.every((argument) => typeof argument === "string"));
  }
}

test("macOS installs and controls a per-user launchd service with fixed argv", async () => {
  const { manager, calls, files } = harness("darwin", {
    homeDirectory: "/Users/opl",
    uid: 501,
    serviceEnvironment: {
      OPL_HEADLESS_PORT: "4180",
      OPL_NATIVE_APP_UPDATE_CARRIER: "standalone_headless_webui"
    }
  });

  const installed = await manager.run("install");
  assert.equal(installed.scope, "user");
  assert.equal(installed.serviceId, "com.onepersonlab.headless");
  assert.deepEqual(calls.map(({ command, args }) => [command, args]), [
    ["launchctl", ["bootout", "gui/501/com.onepersonlab.headless"]],
    ["launchctl", ["bootstrap", "gui/501", "/Users/opl/Library/LaunchAgents/com.onepersonlab.headless.plist"]]
  ]);
  const plist = files.find((file) => file.operation === "writeFile");
  assert.equal(plist.target, "/Users/opl/Library/LaunchAgents/com.onepersonlab.headless.plist");
  assert.match(plist.contents, /<string>\/usr\/bin\/node<\/string>/);
  assert.match(plist.contents, /<string>\/opt\/one-person-lab\/scripts\/headless\/run\.mjs<\/string>/);
  assert.match(plist.contents, /<key>EnvironmentVariables<\/key>/);
  assert.match(plist.contents, /<key>OPL_HEADLESS_PORT<\/key>\s*<string>4180<\/string>/);
  assert.match(plist.contents, /<key>OPL_NATIVE_APP_UPDATE_CARRIER<\/key>\s*<string>standalone_headless_webui<\/string>/);
  assert.doesNotMatch(plist.contents, /\/bin\/(?:ba)?sh|--headless/);
  assertNoShell(calls);

  calls.length = 0;
  await manager.run("status");
  await manager.run("start");
  await manager.run("stop");
  await manager.run("restart");
  assert.deepEqual(calls.map(({ command, args }) => [command, args]), [
    ["launchctl", ["print", "gui/501/com.onepersonlab.headless"]],
    ["launchctl", ["bootstrap", "gui/501", "/Users/opl/Library/LaunchAgents/com.onepersonlab.headless.plist"]],
    ["launchctl", ["bootout", "gui/501/com.onepersonlab.headless"]],
    ["launchctl", ["bootout", "gui/501/com.onepersonlab.headless"]],
    ["launchctl", ["bootstrap", "gui/501", "/Users/opl/Library/LaunchAgents/com.onepersonlab.headless.plist"]]
  ]);
});

test("Linux uses systemd --user and removes only the user unit", async () => {
  const { manager, calls, files } = harness("linux", {
    headlessEntry: "/opt/one person lab/scripts/headless/run.mjs",
    serviceEnvironment: {
      OPL_HEADLESS_PORT: "4180",
      OPL_NATIVE_APP_UPDATE_CHECK_ARGS_JSON: '["/opt/one person lab/scripts/headless/update-runner.mjs","check"]'
    }
  });

  await manager.run("install");
  await manager.run("status");
  await manager.run("start");
  await manager.run("stop");
  await manager.run("restart");
  await manager.run("uninstall");

  assert.deepEqual(calls.map(({ command, args }) => [command, args]), [
    ["systemctl", ["--user", "daemon-reload"]],
    ["systemctl", ["--user", "enable", "--now", "one-person-lab-headless.service"]],
    ["systemctl", ["--user", "show", "one-person-lab-headless.service", "--property=LoadState,ActiveState,SubState", "--no-pager"]],
    ["systemctl", ["--user", "start", "one-person-lab-headless.service"]],
    ["systemctl", ["--user", "stop", "one-person-lab-headless.service"]],
    ["systemctl", ["--user", "restart", "one-person-lab-headless.service"]],
    ["systemctl", ["--user", "disable", "--now", "one-person-lab-headless.service"]],
    ["systemctl", ["--user", "daemon-reload"]]
  ]);
  const unit = files.find((file) => file.operation === "writeFile");
  assert.equal(unit.target, "/home/opl/.config/systemd/user/one-person-lab-headless.service");
  assert.match(unit.contents, /^\[Unit\]/);
  assert.match(unit.contents, /WorkingDirectory=\/opt\/one\\x20person\\x20lab/);
  assert.match(unit.contents, /ExecStart="\/usr\/bin\/node" "\/opt\/one person lab\/scripts\/headless\/run\.mjs"/);
  assert.match(unit.contents, /Environment="OPL_HEADLESS_PORT=4180"/);
  assert.match(unit.contents, /Environment="OPL_NATIVE_APP_UPDATE_CHECK_ARGS_JSON=\[\\"\/opt\/one person lab\/scripts\/headless\/update-runner\.mjs\\",\\"check\\"\]"/);
  assert.doesNotMatch(unit.contents, /--headless|ExecStart=.*(?:ba)?sh/);
  assert.ok(files.some((file) => file.operation === "rm" && file.target === unit.target));
  assertNoShell(calls);
});

test("Windows registers a limited current-user task without command-shell composition", async () => {
  const { manager, calls, files } = harness("win32", {
    localAppData: "C:\\Users\\opl\\AppData\\Local"
  });

  await manager.run("install");
  await manager.run("status");
  await manager.run("start");
  await manager.run("stop");
  await manager.run("restart");
  await manager.run("uninstall");

  const taskPath = "C:\\Users\\opl\\AppData\\Local\\OnePersonLab\\Headless\\headless-task.xml";
  assert.deepEqual(calls.map(({ command, args }) => [command, args]), [
    ["schtasks.exe", ["/Create", "/TN", "\\OnePersonLab\\Headless", "/XML", taskPath, "/F"]],
    ["schtasks.exe", ["/Run", "/TN", "\\OnePersonLab\\Headless"]],
    ["schtasks.exe", ["/Query", "/TN", "\\OnePersonLab\\Headless", "/FO", "LIST", "/V"]],
    ["schtasks.exe", ["/Run", "/TN", "\\OnePersonLab\\Headless"]],
    ["schtasks.exe", ["/End", "/TN", "\\OnePersonLab\\Headless"]],
    ["schtasks.exe", ["/End", "/TN", "\\OnePersonLab\\Headless"]],
    ["schtasks.exe", ["/Run", "/TN", "\\OnePersonLab\\Headless"]],
    ["schtasks.exe", ["/End", "/TN", "\\OnePersonLab\\Headless"]],
    ["schtasks.exe", ["/Delete", "/TN", "\\OnePersonLab\\Headless", "/F"]]
  ]);
  const xml = files.find((file) => file.operation === "writeFile");
  assert.equal(xml.target, taskPath);
  assert.match(xml.contents, /<RunLevel>LeastPrivilege<\/RunLevel>/);
  assert.match(xml.contents, /<Command>C:\\Program Files\\nodejs\\node\.exe<\/Command>/);
  assert.match(xml.contents, /<Arguments>&quot;C:\\Program Files\\One Person Lab\\scripts\\headless\\run\.mjs&quot;<\/Arguments>/);
  assert.doesNotMatch(xml.contents, /cmd\.exe|powershell|--headless/i);
  assertNoShell(calls);
});

test("POSIX root execution is rejected before files or service state are touched", async () => {
  const { manager, calls, files } = harness("linux", { uid: 0 });
  await assert.rejects(manager.run("install"), /must run as a non-root user/);
  assert.deepEqual(calls, []);
  assert.deepEqual(files, []);
});

test("unknown platforms and actions fail explicitly", async () => {
  const unsupported = harness("aix").manager;
  await assert.rejects(unsupported.run("install"), /Unsupported platform/);
  const supported = harness("linux").manager;
  await assert.rejects(supported.run("enable"), /Unknown service action/);
});

test("loaded-service restart helper uses one fixed user-service argv without a shell", async () => {
  const calls = [];
  const execute = async (command, args, options) => {
    calls.push({ command, args, options });
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  await restartLoadedHeadlessService({ platform: "darwin", uid: 501, execute });
  await restartLoadedHeadlessService({ platform: "linux", uid: 1001, execute });
  assert.deepEqual(calls, [
    {
      command: "launchctl",
      args: ["kickstart", "-k", "gui/501/com.onepersonlab.headless"],
      options: { shell: false }
    },
    {
      command: "systemctl",
      args: ["--user", "restart", "one-person-lab-headless.service"],
      options: { shell: false }
    }
  ]);
});

test("macOS restart retries bootstrap while launchd finishes bootout", async () => {
  const calls = [];
  const waits = [];
  let bootstrapAttempts = 0;
  const manager = createHeadlessServiceManager({
    platform: "darwin",
    homeDirectory: "/Users/opl",
    uid: 501,
    nodeExecutable: "/usr/bin/node",
    headlessEntry: "/opt/one-person-lab/scripts/headless/run.mjs",
    sleep: async (milliseconds) => waits.push(milliseconds),
    execute: async (command, args, options) => {
      calls.push({ command, args, options });
      if (args[0] === "bootstrap" && bootstrapAttempts++ === 0) {
        return { exitCode: 5, stdout: "", stderr: "Bootstrap failed: 5: Input/output error" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    fileSystem: { mkdir: async () => {}, writeFile: async () => {}, rm: async () => {} }
  });

  const restarted = await manager.run("restart");
  assert.equal(restarted.native.exitCode, 0);
  assert.deepEqual(calls.map(({ command, args }) => [command, args]), [
    ["launchctl", ["bootout", "gui/501/com.onepersonlab.headless"]],
    ["launchctl", ["bootstrap", "gui/501", "/Users/opl/Library/LaunchAgents/com.onepersonlab.headless.plist"]],
    ["launchctl", ["bootstrap", "gui/501", "/Users/opl/Library/LaunchAgents/com.onepersonlab.headless.plist"]]
  ]);
  assert.deepEqual(waits, [100]);
  assertNoShell(calls);
});

test("macOS uninstall waits for launchd absence before removing the service definition", async () => {
  const operations = [];
  const waits = [];
  let printAttempts = 0;
  const manager = createHeadlessServiceManager({
    platform: "darwin",
    homeDirectory: "/Users/opl",
    uid: 501,
    nodeExecutable: "/usr/bin/node",
    headlessEntry: "/opt/one-person-lab/scripts/headless/run.mjs",
    sleep: async (milliseconds) => waits.push(milliseconds),
    execute: async (command, args, options) => {
      operations.push({ operation: "execute", command, args, options });
      if (args[0] === "print") {
        printAttempts += 1;
        return printAttempts < 3
          ? { exitCode: 0, stdout: "still loaded", stderr: "" }
          : { exitCode: 113, stdout: "", stderr: "Could not find service" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    fileSystem: {
      mkdir: async () => {},
      writeFile: async () => {},
      rm: async (target, options) => operations.push({ operation: "rm", target, options })
    }
  });

  const uninstalled = await manager.run("uninstall");
  assert.deepEqual(uninstalled.absenceReadback, {
    command: "launchctl print",
    absent: true,
    attempts: 3,
    exitCode: 113
  });
  assert.deepEqual(waits, [100, 100]);
  assert.deepEqual(operations.map((entry) => entry.operation === "execute"
    ? [entry.command, entry.args]
    : [entry.operation, entry.target]), [
    ["launchctl", ["bootout", "gui/501/com.onepersonlab.headless"]],
    ["launchctl", ["print", "gui/501/com.onepersonlab.headless"]],
    ["launchctl", ["print", "gui/501/com.onepersonlab.headless"]],
    ["launchctl", ["print", "gui/501/com.onepersonlab.headless"]],
    ["rm", "/Users/opl/Library/LaunchAgents/com.onepersonlab.headless.plist"]
  ]);
});

test("macOS uninstall preserves the service definition when launchd absence cannot be proven", async () => {
  const removed = [];
  const manager = createHeadlessServiceManager({
    platform: "darwin",
    homeDirectory: "/Users/opl",
    uid: 501,
    nodeExecutable: "/usr/bin/node",
    headlessEntry: "/opt/one-person-lab/scripts/headless/run.mjs",
    sleep: async () => {},
    execute: async () => ({ exitCode: 0, stdout: "still loaded", stderr: "" }),
    fileSystem: {
      mkdir: async () => {},
      writeFile: async () => {},
      rm: async (target) => removed.push(target)
    }
  });

  await assert.rejects(
    manager.run("uninstall"),
    /service remained loaded after bootout/
  );
  assert.deepEqual(removed, []);
});

test("macOS LaunchAgent plist serializes via plist package and round-trips XML special characters cleanly", async () => {
  const { manager, files } = harness("darwin", {
    homeDirectory: "/Users/o&p<l>",
    uid: 501,
    serviceEnvironment: {
      OPL_SPECIAL: "a&b<c>\"'d"
    }
  });

  await manager.run("install");
  const plistFile = files.find((file) => file.operation === "writeFile");
  const parsed = parsePlist(plistFile.contents);
  assert.deepEqual(parsed, {
    Label: "com.onepersonlab.headless",
    ProgramArguments: ["/usr/bin/node", "/opt/one-person-lab/scripts/headless/run.mjs"],
    WorkingDirectory: "/opt/one-person-lab",
    EnvironmentVariables: { OPL_SPECIAL: "a&b<c>\"'d" },
    RunAtLoad: true,
    KeepAlive: true,
    ProcessType: "Background",
    StandardOutPath: "/Users/o&p<l>/Library/Logs/One Person Lab/headless.stdout.log",
    StandardErrorPath: "/Users/o&p<l>/Library/Logs/One Person Lab/headless.stderr.log"
  });

  const { manager: emptyEnvManager, files: emptyEnvFiles } = harness("darwin", {
    homeDirectory: "/Users/opl",
    uid: 501
  });
  await emptyEnvManager.run("install");
  const parsedWithoutEnv = parsePlist(emptyEnvFiles.find((file) => file.operation === "writeFile").contents);
  assert.equal("EnvironmentVariables" in parsedWithoutEnv, false);
});
