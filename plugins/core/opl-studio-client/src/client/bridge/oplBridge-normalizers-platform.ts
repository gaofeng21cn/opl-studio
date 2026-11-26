import { asBoolean, asNumber, asRecord, asString } from "@gaofeng21cn/opl-host-contracts/bridge-primitives";
import type { AppLogDirectoryUpdateResult, CarrierDiagnosticsReadback } from "@gaofeng21cn/opl-host-contracts";
import type { NativeAppUpdateOperation, NativeAppUpdateResult } from "@gaofeng21cn/opl-host-contracts";

export function unavailableCarrierDiagnostics(
  carrier: CarrierDiagnosticsReadback["carrier"] = "browser_placeholder",
  reasonCode = "carrier_log_directory_unavailable"
): CarrierDiagnosticsReadback {
  return {
    schema: "opl_app_carrier_diagnostics.v1",
    owner: "one-person-lab-app_native_host",
    carrier,
    status: "unavailable",
    setLogDirectorySupported: false,
    reasonCode
  };
}

export function normalizeCarrierDiagnostics(value: unknown): CarrierDiagnosticsReadback {
  const record = asRecord(value);
  const ownerValue = asString(record?.owner);
  const owner = (["one-person-lab-app_native_host", "one-person-lab-app_desktop_host"] as const)
    .find((item) => item === ownerValue);
  const carrierValue = asString(record?.carrier);
  const carrier = (["electron_desktop", "standalone_headless_webui", "docker_webui", "browser_placeholder"] as const)
    .find((item) => item === carrierValue) ?? "browser_placeholder";
  const application = asRecord(record?.application);
  const systemInfo = asRecord(application?.systemInfo);
  const logDir = asString(systemInfo?.logDir);
  if (
    record?.schema === "opl_app_carrier_diagnostics.v1"
    && owner
    && record.status === "available"
    && logDir
  ) {
    return {
      schema: "opl_app_carrier_diagnostics.v1",
      owner,
      carrier,
      status: "available",
      application: { systemInfo: { logDir, ...(asString(systemInfo?.platform) ? { platform: asString(systemInfo?.platform) } : {}), ...(asString(systemInfo?.arch) ? { arch: asString(systemInfo?.arch) } : {}) } },
      setLogDirectorySupported: record.setLogDirectorySupported === true,
      ...(asString(record.frameworkBootstrapStatus) ? { frameworkBootstrapStatus: asString(record.frameworkBootstrapStatus) } : {}),
      ...(asString(record.frameworkActivationStatus) ? { frameworkActivationStatus: asString(record.frameworkActivationStatus) } : {}),
      ...(asString(record.reasonCode) ? { reasonCode: asString(record.reasonCode) } : {})
    };
  }
  return unavailableCarrierDiagnostics(carrier, asString(record?.reasonCode));
}


export function nativeUpdaterPlaceholder(operation: NativeAppUpdateOperation): NativeAppUpdateResult {
  return {
    schema: "opl_native_app_updater.v1",
    owner: "one-person-lab-app_native_host",
    host: "browser_placeholder",
    operation,
    supported: false,
    state: "unsupported",
    restartRequired: false,
    reasonCode: "native_host_required",
    ownerFallback: "one-person-lab-app"
  };
}

export function unsupportedLogDirectoryUpdate(): AppLogDirectoryUpdateResult {
  return {
    schema: "opl_app_log_directory_update.v1",
    owner: "one-person-lab-app_native_host",
    carrier: "browser_placeholder",
    action: "application.setLogDirectory",
    status: "unsupported",
    success: false,
    reasonCode: "desktop_host_required"
  };
}
