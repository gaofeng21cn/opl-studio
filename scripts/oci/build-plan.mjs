import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const multiArchPlatforms = Object.freeze(["linux/amd64", "linux/arm64"]);

function selectedPlatforms(platform) {
  if (platform === undefined) return multiArchPlatforms;
  const selected = required(platform, "platform");
  if (!multiArchPlatforms.includes(selected)) {
    throw new Error(`platform must be one of: ${multiArchPlatforms.join(", ")}`);
  }
  return Object.freeze([selected]);
}

function required(value, name) {
  if (typeof value !== "string" || !value || /[\0\r\n]/.test(value)) {
    throw new Error(`${name} must be a non-empty single-line value`);
  }
  return value;
}

function exactRevision(value, name) {
  const revision = required(value, name);
  if (!/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error(`${name} must be an exact 40-character Git SHA`);
  }
  return revision;
}

export function createMultiArchBuildPlan({ image, sourceRevision, frameworkRef, appRef, output, platform }) {
  const imageRef = required(image, "image");
  const revision = exactRevision(sourceRevision, "sourceRevision");
  const frameworkRevision = exactRevision(frameworkRef, "frameworkRef");
  const appRevision = exactRevision(appRef, "appRef");
  const destination = path.resolve(required(output, "output"));
  const platforms = selectedPlatforms(platform);
  if (/:latest$/.test(imageRef)) throw new Error("image must not use the latest tag");
  return {
    schema: "one_person_lab_oci_multi_arch_build_plan.v1",
    status: "plan_only",
    platforms,
    image: imageRef,
    sourceRevision: revision,
    externalCohort: {
      frameworkRef: frameworkRevision,
      appRef: appRevision
    },
    output: destination,
    command: [
      "docker", "buildx", "build",
      "--platform", platforms.join(","),
      "--provenance=mode=max",
      "--sbom=true",
      "--output", `type=oci,dest=${destination}`,
      "--build-arg", `OPL_SOURCE_REVISION=${revision}`,
      "--build-arg", `OPL_FRAMEWORK_REF=${frameworkRevision}`,
      "--build-arg", `OPL_APP_REF=${appRevision}`,
      "--tag", imageRef,
      "."
    ],
    evidenceBoundary: {
      executesBuild: false,
      publishesImage: false,
      hostedArchitectureQualified: false,
      registryDigestKnown: false,
      signatureVerified: false
    }
  };
}

export function parseBuildPlanArgs(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        image: { type: "string" },
        "source-revision": { type: "string" },
        "framework-ref": { type: "string" },
        "app-ref": { type: "string" },
        output: { type: "string" },
        platform: { type: "string" }
      }
    });
  } catch (error) {
    const token = error.message.match(/'([^']+)'/)?.[1]?.split(" ")[0] ?? argv[0];
    if (error.code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") throw new Error(`Missing value for ${token}`);
    throw new Error(`Unknown option: ${token}`);
  }
  const fieldMap = [
    ["image", "image"],
    ["source-revision", "sourceRevision"],
    ["framework-ref", "frameworkRef"],
    ["app-ref", "appRef"],
    ["output", "output"],
    ["platform", "platform"]
  ];
  const options = {};
  for (const [flagName, field] of fieldMap) {
    const value = parsed.values[flagName];
    if (value === undefined) continue;
    if (!value) throw new Error(`Missing value for --${flagName}`);
    options[field] = value;
  }
  return options;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    process.stdout.write(`${JSON.stringify(createMultiArchBuildPlan(parseBuildPlanArgs(process.argv.slice(2))), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: "oci_build_plan_failed", message: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
