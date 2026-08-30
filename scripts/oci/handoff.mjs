import path from "node:path";
import { pathToFileURL } from "node:url";

const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const repository = "ghcr.io/gaofeng21cn/opl-studio-webui";

function required(value, name) {
  if (typeof value !== "string" || !value || /[\0\r\n]/.test(value)) throw new Error(`${name} is required`);
  return value;
}
function sha(value, name) {
  const normalized = required(value, name);
  if (!shaPattern.test(normalized)) throw new Error(`${name} must be an exact Git SHA`);
  return normalized;
}

function digest(value, name) {
  const normalized = required(value, name);
  if (!digestPattern.test(normalized)) throw new Error(`${name} must be an OCI digest`);
  return normalized;
}

export function createCloudWorkspaceImageHandoff(input) {
  const version = required(input.version, "version");
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error("version must be numeric SemVer");
  const studioRef = sha(input.studioRef, "studioRef");
  const indexDigest = digest(input.indexDigest, "indexDigest");
  const previousDigest = input.previousDigest ? digest(input.previousDigest, "previousDigest") : null;
  if (input.verification !== "passed") throw new Error("handoff requires passed supply-chain verification");
  return {
    schema: "opl_studio_cloud_workspace_image_handoff.v1",
    status: "preview_image_qualified",
    image: {
      repository,
      index_ref: `${repository}@${indexDigest}`,
      index_digest: indexDigest,
      child_manifests: [
        { platform: "linux/amd64", digest: digest(input.amd64Digest, "amd64Digest") },
        { platform: "linux/arm64", digest: digest(input.arm64Digest, "arm64Digest") }
      ],
      immutable_tags: [`v${version}`, `sha-${studioRef}`],
      channel_tag: "preview",
      forbidden_tags: ["stable", "latest"]
    },
    source: {
      studio_ref: studioRef,
      app_ref: sha(input.appRef, "appRef"),
      framework_ref: sha(input.frameworkRef, "frameworkRef"),
      dsh_ref: sha(input.dshRef, "dshRef")
    },
    runtime: {
      endpoint: "http:3000",
      health_path: "/healthz",
      readiness_path: "/readyz",
      deployment_mode: "cloud",
      auth_mode: "password",
      username_default: "opl",
      environment: [
        "OPL_WEBUI_DEPLOYMENT_MODE",
        "OPL_WEBUI_AUTH_MODE",
        "OPL_WEBUI_USERNAME",
        "OPL_WEBUI_PASSWORD_FILE",
        "OPL_WEBUI_SESSION_SECRET_FILE"
      ],
      cookie_name: "aionui-session",
      session_days: 30,
      csrf: "session_bound_header"
    },
    container: {
      user: "1000:1000",
      read_only_root: true,
      capabilities_dropped: "ALL",
      no_new_privileges: true,
      volumes: ["/data", "/projects"],
      staged_inputs_root: "/data/inputs"
    },
    supply_chain: {
      sbom: "spdx_present",
      provenance: "buildkit_mode_max_present",
      cosign: "index_and_child_digests_verified",
      workflow_identity: "https://github.com/gaofeng21cn/opl-studio/.github/workflows/studio-webui-preview.yml@refs/heads/main",
      oidc_issuer: "https://token.actions.githubusercontent.com"
    },
    rollback: { previous_index_digest: previousDigest },
    adoption: {
      active_shell_adopted: false,
      release_ready: false,
      cloud_activation_owner: "opl-cloud",
      cloud_activated: false
    }
  };
}

function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${flag}`);
    options[flag.replace(/^--/, "").replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
  }
  return options;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    process.stdout.write(`${JSON.stringify(createCloudWorkspaceImageHandoff(parse(process.argv.slice(2))), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: "handoff_failed", message: error.message })}\n`);
    process.exitCode = 1;
  }
}
