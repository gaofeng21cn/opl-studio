import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  rmdir,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const actions = new Set(["install", "status", "start", "update", "recreate", "rollback", "uninstall"]);
const modulePath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(modulePath), "../..");
const digestPattern = /^\S+@sha256:[a-f0-9]{64}$/;
const imageIdPattern = /^sha256:[a-f0-9]{64}$/;
const officialImagePattern = /^ghcr\.io\/gaofeng21cn\/opl-studio-webui@sha256:[a-f0-9]{64}$/;
const officialWorkflowIdentity = "https://github.com/gaofeng21cn/opl-studio/.github/workflows/studio-webui-preview.yml@refs/heads/main";
const githubOidcIssuer = "https://token.actions.githubusercontent.com";

export class OciManagerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "OciManagerError";
    this.code = code;
    this.details = details;
  }
}

function executeProcess(command, args, { env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (exitCode, signal) => resolve({
      exitCode: exitCode ?? 1,
      signal,
      stdout,
      stderr
    }));
  });
}

function defaultStateDirectory(env, homeDirectory, platform) {
  if (platform === "win32") {
    return path.join(env.LOCALAPPDATA || path.join(homeDirectory, "AppData", "Local"), "OnePersonLab", "OCI");
  }
  return path.join(env.XDG_STATE_HOME || path.join(homeDirectory, ".local", "state"), "one-person-lab", "oci");
}

function assertSingleLine(value, name) {
  if (typeof value !== "string" || !value || /[\0\r\n]/.test(value)) {
    throw new OciManagerError("invalid_argument", `${name} must be a non-empty single-line value`, { name });
  }
  return value;
}

function projectName(value) {
  const normalized = assertSingleLine(value, "projectName");
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(normalized)) {
    throw new OciManagerError("invalid_argument", "projectName must use lowercase letters, digits, hyphens, or underscores", {
      name: "projectName"
    });
  }
  return normalized;
}

function portNumber(value) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 65_535) {
    throw new OciManagerError("invalid_argument", "port must be an integer from 1 through 65535", { name: "port" });
  }
  return normalized;
}

function imageReference(value) {
  const normalized = assertSingleLine(value, "image");
  if (/\s/.test(normalized) || normalized.startsWith("-")) {
    throw new OciManagerError("invalid_argument", "image must not contain whitespace or start with a hyphen", { name: "image" });
  }
  return normalized;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function statePaths(stateDirectory) {
  return {
    stateDirectory,
    statePath: path.join(stateDirectory, "installation.json"),
    composePath: path.join(stateDirectory, "docker-compose.yaml"),
    lockPath: path.join(stateDirectory, ".operation.lock")
  };
}

function safeStateDirectory(value, { homeDirectory, sourceRoot }) {
  const resolved = path.resolve(value);
  const forbidden = new Set([
    path.parse(resolved).root,
    path.resolve(homeDirectory),
    path.resolve(sourceRoot)
  ]);
  if (forbidden.has(resolved)) {
    throw new OciManagerError("state_directory_unsafe", "stateDirectory must not be a filesystem, home, or repository root");
  }
  return resolved;
}

export function createOciManager({
  execute = executeProcess,
  env = process.env,
  homeDirectory = os.homedir(),
  platform = process.platform,
  sourceRoot = repositoryRoot,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = () => new Date().toISOString(),
  healthTimeoutMs = 60_000
} = {}) {
  async function docker(args, { allowFailure = false, extraEnv = {} } = {}) {
    const result = await execute("docker", args, { env: { ...env, ...extraEnv } });
    if (!result || !Number.isInteger(result.exitCode)) {
      throw new OciManagerError("docker_result_invalid", "docker returned an invalid execution result");
    }
    if (result.exitCode !== 0 && !allowFailure) {
      throw new OciManagerError("docker_command_failed", result.stderr?.trim() || result.stdout?.trim() || "docker command failed", {
        args,
        exitCode: result.exitCode
      });
    }
    return result;
  }

  async function ensureDocker() {
    await docker(["info", "--format", "{{.ServerVersion}}"]).catch((error) => {
      throw new OciManagerError("docker_unavailable", "Docker Engine is unavailable", { cause: error.message });
    });
    await docker(["compose", "version", "--short"]).catch((error) => {
      throw new OciManagerError("compose_unavailable", "Docker Compose is unavailable", { cause: error.message });
    });
  }

  async function inspectImage(reference, { allowPull }) {
    let idResult = await docker(["image", "inspect", reference, "--format", "{{.Id}}"], { allowFailure: true });
    if (idResult.exitCode !== 0 && allowPull) {
      await docker(["pull", reference]);
      idResult = await docker(["image", "inspect", reference, "--format", "{{.Id}}"]).catch((error) => {
        throw new OciManagerError("image_unavailable", `Unable to inspect ${reference}`, { cause: error.message });
      });
    }
    if (idResult.exitCode !== 0) {
      throw new OciManagerError("image_unavailable", `Image is not available locally: ${reference}`);
    }
    const observedId = idResult.stdout.trim();
    if (!imageIdPattern.test(observedId)) {
      throw new OciManagerError("image_identity_invalid", `Docker returned an invalid image ID for ${reference}`);
    }
    const repoDigestsResult = await docker(["image", "inspect", reference, "--format", "{{json .RepoDigests}}"]);
    const labelsResult = await docker(["image", "inspect", reference, "--format", "{{json .Config.Labels}}"]);
    const repoDigests = parseJson(repoDigestsResult.stdout.trim(), []);
    const labels = parseJson(labelsResult.stdout.trim(), {});
    return {
      observedId,
      repoDigests: Array.isArray(repoDigests) ? repoDigests : [],
      labels: labels && typeof labels === "object" && !Array.isArray(labels) ? labels : {}
    };
  }

  async function resolveImage(reference, { allowLocalImage }) {
    const requestedRef = imageReference(reference);
    const registryDigest = digestPattern.test(requestedRef);
    if (!registryDigest && allowLocalImage !== true) {
      throw new OciManagerError(
        "mutable_image_ref_rejected",
        "Install and update require an image pinned by registry digest; use --allow-local-image only for local candidate validation",
        { requestedRef }
      );
    }
    let signatureVerification = {
      status: "local_candidate_only",
      workflowIdentity: null,
      oidcIssuer: null
    };
    if (registryDigest) {
      if (!officialImagePattern.test(requestedRef)) {
        throw new OciManagerError("untrusted_registry_image", "Official install and update require the OPL Studio WebUI registry namespace", { requestedRef });
      }
      const cosignBin = assertSingleLine(env.COSIGN_BIN, "COSIGN_BIN");
      const verification = await execute(cosignBin, [
        "verify",
        "--certificate-identity", officialWorkflowIdentity,
        "--certificate-oidc-issuer", githubOidcIssuer,
        "--output", "json",
        requestedRef
      ], { env });
      if (!verification || verification.exitCode !== 0) {
        throw new OciManagerError("signature_verification_failed", "Cosign did not verify the official Studio workflow identity", {
          requestedRef,
          exitCode: verification?.exitCode ?? null
        });
      }
      signatureVerification = {
        status: "verified",
        workflowIdentity: officialWorkflowIdentity,
        oidcIssuer: githubOidcIssuer
      };
    }
    const inspected = await inspectImage(requestedRef, { allowPull: registryDigest });
    if (registryDigest && !inspected.repoDigests.includes(requestedRef)) {
      throw new OciManagerError("registry_digest_mismatch", "The inspected image does not report the requested registry digest", {
        requestedRef,
        repoDigests: inspected.repoDigests
      });
    }
    return {
      requestedRef,
      immutableRef: registryDigest ? requestedRef : inspected.observedId,
      observedId: inspected.observedId,
      identityKind: registryDigest ? "registry_digest" : "local_image_id",
      repoDigests: inspected.repoDigests,
      sourceRevision: inspected.labels["org.opencontainers.image.revision"] ?? null,
      supplyChain: {
        registryDigestPinned: registryDigest,
        localCandidateOnly: !registryDigest,
        signatureVerification,
        sbomAndProvenance: "required_by_multi_arch_build_contract_not_verified_by_installer"
      }
    };
  }

  async function readState(paths, { required = true } = {}) {
    let value;
    try {
      value = JSON.parse(await readFile(paths.statePath, "utf8"));
    } catch (error) {
      if (!required && error.code === "ENOENT") return null;
      if (error.code === "ENOENT") throw new OciManagerError("not_installed", "One Person Lab OCI is not installed");
      throw new OciManagerError("state_invalid", "OCI installation state is unreadable", { cause: error.message });
    }
    if (value?.schema !== "one_person_lab_oci_installation.v1" || value.composePath !== paths.composePath) {
      throw new OciManagerError("state_invalid", "OCI installation state does not match this manager");
    }
    projectName(value.projectName);
    portNumber(value.port);
    if (!imageIdPattern.test(value.current?.observedId ?? "") || !value.current?.immutableRef) {
      throw new OciManagerError("state_invalid", "OCI installation state has no valid current image identity");
    }
    return value;
  }

  async function writeState(paths, value) {
    const temporaryPath = `${paths.statePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, paths.statePath);
  }

  async function withLock(paths, operation) {
    await mkdir(paths.stateDirectory, { recursive: true, mode: 0o700 });
    let handle;
    try {
      handle = await open(paths.lockPath, "wx", 0o600);
    } catch (error) {
      if (error.code === "EEXIST") {
        throw new OciManagerError("operation_in_progress", "Another OCI lifecycle operation is already in progress");
      }
      throw error;
    }
    try {
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: now() })}\n`, "utf8");
      return await operation();
    } finally {
      await handle.close();
      await rm(paths.lockPath, { force: true });
    }
  }

  function composeEnvironment(state) {
    return {
      OPL_APP_IMAGE: state.current.immutableRef,
      OPL_APP_PORT: String(state.port),
      OPL_APP_READ_ONLY: "1"
    };
  }

  async function compose(state, args, { allowFailure = false } = {}) {
    let composeBytes;
    try {
      composeBytes = await readFile(state.composePath, "utf8");
    } catch (error) {
      throw new OciManagerError("compose_integrity_invalid", "Managed Compose configuration is unavailable", {
        cause: error.message
      });
    }
    if (hash(composeBytes) !== state.composeSha256) {
      throw new OciManagerError("compose_integrity_invalid", "Managed Compose configuration does not match the installed digest");
    }
    return docker([
      "compose",
      "--project-name", state.projectName,
      "--file", state.composePath,
      ...args
    ], {
      allowFailure,
      extraEnv: composeEnvironment(state)
    });
  }

  async function waitForHealthy(state) {
    const container = (await compose(state, ["ps", "--quiet", "one-person-lab"])).stdout.trim();
    if (!container) throw new OciManagerError("container_missing", "Docker Compose did not create the One Person Lab container");
    const deadline = Date.now() + healthTimeoutMs;
    let lastStatus = "unknown";
    while (Date.now() < deadline) {
      const result = await docker(["inspect", container, "--format", "{{.State.Health.Status}}"], { allowFailure: true });
      if (result.exitCode === 0) {
        lastStatus = result.stdout.trim();
        if (lastStatus === "healthy") return { container, health: lastStatus };
      }
      await sleep(250);
    }
    const healthChecks = await docker([
      "inspect", container, "--format", "{{json .State.Health.Log}}"
    ], { allowFailure: true });
    throw new OciManagerError("container_not_healthy", "One Person Lab container did not become healthy", {
      container,
      health: lastStatus,
      healthChecks: healthChecks.exitCode === 0 ? healthChecks.stdout.trim().slice(-8_000) : null
    });
  }

  async function applyState(state, { forceRecreate }) {
    const args = ["up", "--detach", "--no-build", "--pull", "never", "--remove-orphans"];
    if (forceRecreate) args.push("--force-recreate");
    await compose(state, args);
    return waitForHealthy(state);
  }

  async function status(paths) {
    const state = await readState(paths, { required: false });
    if (!state) return { status: "oci_not_installed", installed: false };
    await ensureDocker();
    const container = (await compose(state, ["ps", "--quiet", "one-person-lab"], { allowFailure: true })).stdout.trim();
    let health = "absent";
    if (container) {
      const result = await docker(["inspect", container, "--format", "{{.State.Health.Status}}"], { allowFailure: true });
      if (result.exitCode === 0) health = result.stdout.trim() || "unknown";
    }
    return {
      status: "oci_status",
      installed: true,
      running: Boolean(container),
      health,
      projectName: state.projectName,
      port: state.port,
      current: state.current,
      previous: state.previous
    };
  }

  async function run(action, options = {}) {
    if (!actions.has(action)) {
      throw new OciManagerError("invalid_action", `Unknown OCI action: ${String(action)}`);
    }
    const stateDirectory = safeStateDirectory(
      options.stateDirectory || defaultStateDirectory(env, homeDirectory, platform),
      { homeDirectory, sourceRoot }
    );
    const paths = statePaths(stateDirectory);
    if (action === "status") return status(paths);

    const result = await withLock(paths, async () => {
      await ensureDocker();
      if (action === "install") {
        const existing = await readState(paths, { required: false });
        const resolved = await resolveImage(options.image, { allowLocalImage: options.allowLocalImage });
        if (existing) {
          if (existing.current.immutableRef !== resolved.immutableRef) {
            throw new OciManagerError("already_installed", "A different OCI image is installed; use update instead");
          }
          const runtime = await applyState(existing, { forceRecreate: false });
          return { status: "oci_install_unchanged", installed: true, ...runtime, current: existing.current };
        }
        const sourceComposePath = path.join(sourceRoot, "docker-compose.distribution.yaml");
        const composeBytes = await readFile(sourceComposePath, "utf8");
        await copyFile(sourceComposePath, paths.composePath);
        await chmod(paths.composePath, 0o644);
        const timestamp = now();
        const candidate = {
          schema: "one_person_lab_oci_installation.v1",
          projectName: projectName(options.projectName ?? "one-person-lab"),
          port: portNumber(options.port ?? 4178),
          composePath: paths.composePath,
          composeSha256: hash(composeBytes),
          current: resolved,
          previous: null,
          installedAt: timestamp,
          updatedAt: timestamp
        };
        try {
          const runtime = await applyState(candidate, { forceRecreate: false });
          await writeState(paths, candidate);
          return { status: "oci_installed", installed: true, ...runtime, current: candidate.current };
        } catch (error) {
          await compose(candidate, ["down", "--remove-orphans"], { allowFailure: true });
          await rm(paths.composePath, { force: true });
          throw error;
        }
      }

      const existing = await readState(paths);
      if (action === "start" || action === "recreate") {
        const runtime = await applyState(existing, { forceRecreate: action === "recreate" });
        return { status: action === "start" ? "oci_started" : "oci_recreated", ...runtime, current: existing.current };
      }
      if (action === "update") {
        const resolved = await resolveImage(options.image, { allowLocalImage: options.allowLocalImage });
        if (resolved.immutableRef === existing.current.immutableRef) {
          return { status: "oci_update_unchanged", changed: false, current: existing.current };
        }
        const candidate = {
          ...existing,
          current: resolved,
          previous: existing.current,
          updatedAt: now()
        };
        try {
          const runtime = await applyState(candidate, { forceRecreate: true });
          await writeState(paths, candidate);
          return { status: "oci_updated", changed: true, ...runtime, current: candidate.current, previous: candidate.previous };
        } catch (updateError) {
          let recovered = false;
          let recoveryError = null;
          try {
            await applyState(existing, { forceRecreate: true });
            recovered = true;
          } catch (error) {
            recoveryError = error.message;
          }
          throw new OciManagerError("update_failed", "OCI update failed; the previous image was retained in installation state", {
            updateError: updateError.message,
            recovered,
            recoveryError
          });
        }
      }
      if (action === "rollback") {
        if (!existing.previous) throw new OciManagerError("rollback_unavailable", "No previous OCI image is available");
        const candidate = {
          ...existing,
          current: existing.previous,
          previous: existing.current,
          updatedAt: now()
        };
        try {
          const runtime = await applyState(candidate, { forceRecreate: true });
          await writeState(paths, candidate);
          return { status: "oci_rolled_back", ...runtime, current: candidate.current, previous: candidate.previous };
        } catch (rollbackError) {
          let recovered = false;
          let recoveryError = null;
          try {
            await applyState(existing, { forceRecreate: true });
            recovered = true;
          } catch (error) {
            recoveryError = error.message;
          }
          throw new OciManagerError("rollback_failed", "OCI rollback failed; the current image was retained in installation state", {
            rollbackError: rollbackError.message,
            recovered,
            recoveryError
          });
        }
      }
      const args = ["down", "--remove-orphans"];
      if (options.purgeData === true) args.push("--volumes");
      await compose(existing, args);
      await rm(paths.statePath, { force: true });
      await rm(paths.composePath, { force: true });
      return {
        status: "oci_uninstalled",
        dataPreserved: options.purgeData !== true,
        projectName: existing.projectName
      };
    });

    if (action === "uninstall") {
      await rmdir(paths.stateDirectory).catch((error) => {
        if (error.code !== "ENOTEMPTY" && error.code !== "ENOENT") throw error;
      });
    }
    return result;
  }

  return { run };
}

function parseCli(argv) {
  const [action, ...rest] = argv;
  const options = {};
  const valueFlags = new Map([
    ["--image", "image"],
    ["--state-dir", "stateDirectory"],
    ["--project-name", "projectName"],
    ["--port", "port"]
  ]);
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--allow-local-image") {
      options.allowLocalImage = true;
      continue;
    }
    if (token === "--purge-data") {
      options.purgeData = true;
      continue;
    }
    const key = valueFlags.get(token);
    if (!key || index + 1 >= rest.length) {
      throw new OciManagerError("invalid_argument", `Unknown or incomplete option: ${token}`);
    }
    options[key] = rest[index + 1];
    index += 1;
  }
  return { action, options };
}

async function main() {
  try {
    const { action, options } = parseCli(process.argv.slice(2));
    const receipt = await createOciManager().run(action, options);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: "oci_operation_failed",
      code: error.code ?? "operation_failed",
      message: error.message ?? String(error),
      details: error.details ?? {}
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
