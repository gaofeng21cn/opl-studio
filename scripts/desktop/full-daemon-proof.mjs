// This function is serialized into a standalone module and run inside the disposable guest.
export async function collectFullDaemonProof({ runtime, manifestPath, expectedRootPackageIds = [] }) {
  const { execFileSync } = await import("node:child_process");
  const { createHash } = await import("node:crypto");
  const { readFile, open } = await import("node:fs/promises");
  const { homedir } = await import("node:os");
  const path = await import("node:path");
  const bytes = await readFile(manifestPath);
  const manifest = JSON.parse(bytes);
  const component = manifest.components?.opl;
  const sha = component?.git_commit;
  const version = component?.framework_daemon_version;
  if (component?.framework_api_version !== "2.0" || !version?.trim()
      || !/^[0-9a-f]{40}$/.test(sha) || manifest.resolved_refs?.opl_framework?.resolved_commit !== sha) {
    throw new Error("Invalid Full Framework v2 manifest identity");
  }

  const stateDir = process.env.OPL_STATE_DIR || (process.env.OPL_DATA_DIR
    ? path.join(process.env.OPL_DATA_DIR, "opl", "state")
    : path.join(homedir(), "Library", "Application Support", "OPL", "state"));
  const databasePath = path.join(stateDir, "opl.db");
  const opl = (...args) => JSON.parse(execFileSync(path.join(runtime, "bin", "opl"), [...args, "--json"], {
    encoding: "utf8", timeout: 60_000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, OPL_STATE_DIR: stateDir }
  }));
  const cli = opl("--version");
  if (cli.api_version !== "2.0" || cli.version !== version) throw new Error("Packaged CLI version differs from its manifest");
  async function snapshot() {
    const doctor = opl("daemon", "doctor", "--include-first-run");
    if (doctor.ok !== true || doctor.api_version !== "2.0" || doctor.version !== version
        || !Number.isSafeInteger(doctor.pid) || doctor.pid < 1 || doctor.paths?.state_dir !== stateDir
        || doctor.sqlite?.db_file !== databasePath || !Number.isSafeInteger(doctor.sqlite.schema_version)
        || doctor.sqlite.schema_version < 1) throw new Error("Unexpected packaged daemon or SQLite state");
    const list = opl("pack", "list").packages;
    if (!Array.isArray(list) || doctor.first_run?.installed_package_count !== list.length
        || list.some(p => !p?.package_id?.trim() || !p.version?.trim() || typeof p.enabled !== "boolean")
        || new Set(list.map(p => p.package_id)).size !== list.length) throw new Error("Invalid installed Package readback");
    const packages = list.filter(p => p.enabled).map(({ package_id, version }) => ({ package_id, version }))
      .sort((a, b) => a.package_id.localeCompare(b.package_id, "en"));
    const missing = expectedRootPackageIds.filter(id => !packages.some(p => p.package_id === id));
    if (missing.length) throw new Error("Missing enabled Official Profile packages: " + missing.join(", "));

    const db = await open(databasePath, "r");
    try {
      const header = Buffer.alloc(16);
      const { bytesRead } = await db.read(header, 0, 16, 0);
      if (bytesRead !== 16 || header.toString() !== "SQLite format 3\0") throw new Error("Invalid Framework SQLite header");
      const stat = await db.stat({ bigint: true });
      return { pid: doctor.pid, sqlite_schema_version: doctor.sqlite.schema_version, database_path: databasePath,
        database_file_identity: String(stat.dev) + ":" + String(stat.ino), packages };
    } finally { await db.close(); }
  }

  const before = await snapshot();
  const stop = opl("daemon", "stop");
  if (stop.ok !== true || stop.stopped !== true) throw new Error("Installed Framework daemon did not stop");
  const after = await snapshot();
  if (before.pid === after.pid || before.sqlite_schema_version !== after.sqlite_schema_version
      || before.database_file_identity !== after.database_file_identity || JSON.stringify(before.packages) !== JSON.stringify(after.packages)) {
    throw new Error("Framework daemon restart did not preserve the guest database and enabled Package state");
  }
  return { schema: "opl_framework_daemon_proof.v1", status: "passed", api_version: "2.0", version,
    framework_sha: sha, full_package_manifest_sha256: createHash("sha256").update(bytes).digest("hex"),
    before_restart: before, after_restart: after };
}
