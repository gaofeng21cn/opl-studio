#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUEST_SCHEMA = "opl-package-app-contribution-request.v1";
const RESPONSE_SCHEMA = "opl-package-app-contribution-response.v1";
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DATA_PATH = path.join(ROOT_DIR, "settings-form-data.example.json");

function loadTemplate() {
  return JSON.parse(fs.readFileSync(TEMPLATE_DATA_PATH, "utf8"));
}

function readState(stateFile, defaults) {
  if (!stateFile || !fs.existsSync(stateFile)) return { ...defaults };
  const parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  return { ...defaults, ...(parsed && typeof parsed === "object" ? parsed : {}) };
}

function writeState(stateFile, nextValues) {
  if (!stateFile) return;
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify(nextValues, null, 2)}\n`, "utf8");
}

function respond(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

let rawInput = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  rawInput += chunk;
});
process.stdin.on("end", () => {
  const template = loadTemplate();
  const request = JSON.parse(rawInput || "{}");
  if (request.schema_version && request.schema_version !== REQUEST_SCHEMA) {
    respond({
      schema_version: RESPONSE_SCHEMA,
      ok: false,
      ref: request.ref ?? "",
      operation: request.operation ?? "read",
      error: { code: "invalid_request_schema", message: `Unsupported request schema: ${request.schema_version}` }
    });
    return;
  }

  const stateFile = process.env.OPL_TIER1_SETTINGS_FILE || "";
  const current = readState(stateFile, template.values ?? {});

  if (request.operation === "read" && request.ref === "example-tier1.settings.v1#state") {
    respond({
      schema_version: RESPONSE_SCHEMA,
      ok: true,
      ref: request.ref,
      operation: "read",
      result: {
        ...template,
        values: current
      }
    });
    return;
  }

  if (request.operation === "execute" && request.ref === "example-tier1.settings.v1#save") {
    const incoming = request.input?.values && typeof request.input.values === "object"
      ? request.input.values
      : (request.input ?? {});
    const endpoint = typeof incoming.endpoint === "string" ? incoming.endpoint.trim() : current.endpoint;
    if (!endpoint || !endpoint.startsWith("https://")) {
      respond({
        schema_version: RESPONSE_SCHEMA,
        ok: false,
        ref: request.ref,
        operation: "execute",
        error: { code: "invalid_endpoint", message: "服务端点必须使用 https:// 协议 (Service endpoint must use https://)" }
      });
      return;
    }
    const concurrency = incoming.concurrency !== undefined ? Number(incoming.concurrency) : Number(current.concurrency ?? 2);
    if (!Number.isFinite(concurrency) || concurrency < 1 || concurrency > 8) {
      respond({
        schema_version: RESPONSE_SCHEMA,
        ok: false,
        ref: request.ref,
        operation: "execute",
        error: { code: "invalid_concurrency", message: "最大并发必须介于 1 到 8 之间 (Concurrency must be 1..8)" }
      });
      return;
    }
    const next = {
      ...current,
      ...incoming,
      endpoint,
      concurrency
    };
    delete next.api_token;
    writeState(stateFile, next);
    respond({
      schema_version: RESPONSE_SCHEMA,
      ok: true,
      ref: request.ref,
      operation: "execute",
      result: { saved: true, values: next }
    });
    return;
  }

  respond({
    schema_version: RESPONSE_SCHEMA,
    ok: false,
    ref: request.ref ?? "",
    operation: request.operation ?? "read",
    error: { code: "unsupported_ref", message: `Unsupported contribution ref: ${request.ref ?? ""}` }
  });
});
