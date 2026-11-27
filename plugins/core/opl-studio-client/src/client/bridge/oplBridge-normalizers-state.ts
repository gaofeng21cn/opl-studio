import { normalizeRuntimeProfile, readRuntimeProfile } from "../workbench/settingsModel";
import { OPL_COMMANDS } from "./oplBridge-commands";
import { asBoolean, asNumber, asRecord, asString, createCommandReadback, parseJsonValue } from "@gaofeng21cn/opl-host-contracts/bridge-primitives";
import { unavailableCarrierDiagnostics, normalizeCarrierDiagnostics } from "./oplBridge-normalizers-platform";
import type {
  OplAppState,
  OplCommandReadback,
  OplFullDrilldownReadback,
  OplInitializeChecklistItem,
  OplInitializeReadback,
  OplStateProfile,
  OplStateReadback
} from "@gaofeng21cn/opl-host-contracts";

function normalizeInitializeChecklistItem(value: unknown): OplInitializeChecklistItem | undefined {
  const record = asRecord(value);
  const itemId = asString(record?.item_id);
  if (!itemId) return undefined;
  return {
    itemId,
    ...(asString(record?.label) ? { label: asString(record?.label) } : {}),
    ...(asString(record?.status) ? { status: asString(record?.status) } : {}),
    blocking: record?.blocking === true,
    required: record?.required === true,
    userActionRequired: record?.user_action_required === true,
    ...(asString(record?.reason_code) ? { reasonCode: asString(record?.reason_code) } : {}),
    ...(asString(record?.readiness_layer) ? { readinessLayer: asString(record?.readiness_layer) } : {}),
    ...(asString(record?.severity) ? { severity: asString(record?.severity) } : {}),
    ...(asString(record?.next_visible_step) ? { nextVisibleStep: asString(record?.next_visible_step) } : {})
  };
}

export function normalizeInitializeReadback(value: unknown): OplInitializeReadback {
  const root = asRecord(value);
  const systemInitialize = asRecord(root?.system_initialize) ?? {};
  const setupFlow = asRecord(systemInitialize.setup_flow) ?? {};
  const progressRecord = asRecord(setupFlow.progress) ?? {};
  const readiness = asRecord(systemInitialize.readiness) ?? {};
  const provider = asRecord(systemInitialize.family_runtime_provider);
  const checklist = Array.isArray(systemInitialize.checklist)
    ? systemInitialize.checklist.flatMap((item) => normalizeInitializeChecklistItem(item) ?? [])
    : [];
  const progress = Object.fromEntries(Object.entries(progressRecord)
    .filter(([, item]) => typeof item === "number" && Number.isFinite(item))
    .map(([key, item]) => [key, item as number]));
  const readback = asRecord(root?.readback);
  return {
    schema: "opl_studio_initialize_readback.v1",
    systemInitialize: {
      ...(asString(systemInitialize.overall_state) ? { overallState: asString(systemInitialize.overall_state) } : {}),
      setupFlow: {
        isFirstRun: setupFlow.is_first_run === true,
        ...(asString(setupFlow.phase) ? { phase: asString(setupFlow.phase) } : {}),
        ...(asBoolean(setupFlow.ready_to_launch) !== undefined ? { readyToLaunch: asBoolean(setupFlow.ready_to_launch) } : {}),
        progress,
        blockingItems: Array.isArray(setupFlow.blocking_items) ? setupFlow.blocking_items.map(String).slice(0, 32) : [],
        maintenanceItems: Array.isArray(setupFlow.maintenance_items) ? setupFlow.maintenance_items.map(String).slice(0, 32) : []
      },
      readiness: {
        ...(asBoolean(readiness.core_ready) !== undefined ? { coreReady: asBoolean(readiness.core_ready) } : {}),
        ...(asBoolean(readiness.domain_ready) !== undefined ? { domainReady: asBoolean(readiness.domain_ready) } : {}),
        ...(asBoolean(readiness.launch_ready) !== undefined ? { launchReady: asBoolean(readiness.launch_ready) } : {}),
        ...(asBoolean(readiness.family_runtime_provider_ready) !== undefined ? { familyRuntimeProviderReady: asBoolean(readiness.family_runtime_provider_ready) } : {}),
        ...(asBoolean(readiness.full_ready) !== undefined ? { fullReady: asBoolean(readiness.full_ready) } : {})
      },
      checklist,
      ...(provider ? {
        familyRuntimeProvider: {
          ...(asString(provider.status) ? { status: asString(provider.status) } : {}),
          ...(asBoolean(provider.ready) !== undefined ? { ready: asBoolean(provider.ready) } : {}),
          ...(asBoolean(provider.full_readiness_blocking) !== undefined ? { fullReadinessBlocking: asBoolean(provider.full_readiness_blocking) } : {})
        }
      } : {})
    },
    readback: {
      command: typeof readback?.command === "string" ? readback.command : "opl system initialize --json",
      commandArgs: Array.isArray(readback?.commandArgs) ? readback.commandArgs.map(String) : ["system", "initialize", "--json"],
      exitCode: asNumber(readback?.exitCode) ?? 0,
      stdout: "",
      stderr: typeof readback?.stderr === "string" ? readback.stderr : "",
      timedOut: readback?.timedOut === true
    }
  };
}


export function normalizeProfile(profile: unknown): OplStateProfile {
  return normalizeRuntimeProfile(profile);
}

export function stateCommand(profile: OplStateProfile): string {
  return profile === "full" ? OPL_COMMANDS.fullState : OPL_COMMANDS.fastState;
}

function defaultStateReadback(profile: OplStateProfile): OplStateReadback {
  return {
    profile,
    app_state: {
      runtime_source: {
        owner: "opl_framework",
        app_repo_truth_owner: "one-person-lab-app",
        normal_gui_state_surface: OPL_COMMANDS.fastState,
        full_gui_state_surface: OPL_COMMANDS.fullState,
        action_boundary_surface: "opl app action execute --action <action_id> [--payload json] [--dry-run] --json",
        full_drilldown_exception_surface: OPL_COMMANDS.fullDrilldown
      },
      operator: { summary: {}, refs: [] },
      modules: { items: [] },
      actions: [],
      managed_companions: [],
      meta: { profile, generated_at: "" },
      provider: { status: "unknown" },
      active_project_lines: []
    },
    readback: createCommandReadback(
      stateCommand(profile),
      ["opl", "app", "state", "--profile", profile, "--json"]
    ),
    carrierDiagnostics: unavailableCarrierDiagnostics()
  };
}

export function defaultFullDrilldown(): OplFullDrilldownReadback {
  return {
    detail: "full",
    drilldown: { status: "unavailable" },
    readback: createCommandReadback(OPL_COMMANDS.fullDrilldown, [], 1, "", "No operator drilldown readback.")
  };
}



export function normalizeCommandReadback(
  value: unknown,
  fallbackCommand: string,
  fallbackArgs: string[]
): OplCommandReadback {
  const record = asRecord(value);
  return createCommandReadback(
    asString(record?.command) ?? fallbackCommand,
    fallbackArgs,
    asNumber(record?.exitCode) ?? 0,
    typeof record?.stdout === "string" ? record.stdout : "",
    typeof record?.stderr === "string" ? record.stderr : "",
    asBoolean(record?.timedOut) ?? false
  );
}

function normalizeStateObject(value: unknown, fallback: OplStateReadback): OplAppState {
  const root = asRecord(value);
  const appState = asRecord(root?.app_state) ?? root;
  if (!appState) return fallback.app_state;
  const operator = asRecord(appState.operator);
  return {
    ...fallback.app_state,
    ...appState,
    runtime_source: {
      ...fallback.app_state.runtime_source,
      ...asRecord(appState.runtime_source)
    },
    operator: {
      ...operator,
      summary: {
        ...fallback.app_state.operator.summary,
        ...asRecord(operator?.summary)
      },
      refs: Array.isArray(operator?.refs)
        ? (operator.refs as unknown[]).map((item) => asRecord(item) ?? {})
        : fallback.app_state.operator.refs,
      ...(asRecord(operator?.workbench) ? { workbench: asRecord(operator?.workbench) as Record<string, unknown> } : {})
    },
    modules: {
      items: Array.isArray(asRecord(appState.modules)?.items)
        ? (asRecord(appState.modules)?.items as unknown[]).map((item) => asRecord(item) ?? {})
        : fallback.app_state.modules.items
    },
    actions: Array.isArray(appState.actions)
      ? appState.actions.map((item) => {
          const action = asRecord(item);
          const id = asString(action?.action_id) ?? "";
          return {
            action_id: id,
            label: asString(action?.label) ?? id,
            route: asString(action?.route) ?? `opl app action execute --action ${id}`,
            ...(asString(action?.surface) ? { surface: asString(action?.surface) as string } : {}),
            ...(asString(action?.submit_via) ? { submit_via: asString(action?.submit_via) as string } : {}),
            payload_fields: Array.isArray(action?.payload_fields)
              ? action.payload_fields.map((field) => String(field))
              : [],
            mutates: asString(action?.mutates) ?? "unknown",
            dry_run_supported: asBoolean(action?.dry_run_supported) ?? false,
            confirmation_required: asBoolean(action?.confirmation_required) ?? false,
            ...(asString(action?.danger_level) ? { danger_level: asString(action?.danger_level) as string } : {}),
            owner: asString(action?.owner) ?? "",
            delegated_surface: asString(action?.delegated_surface) ?? "",
            can_submit_to_safe_action_shell: asBoolean(action?.can_submit_to_safe_action_shell) ?? false,
            route_requires_domain_or_app_payload: asBoolean(action?.route_requires_domain_or_app_payload) ?? false
          };
        }).filter((action) => Boolean(action.action_id))
      : fallback.app_state.actions,
    managed_companions: Array.isArray(appState.managed_companions)
      ? appState.managed_companions
          .map(asRecord)
          .filter((item): item is Record<string, unknown> => item !== null)
      : fallback.app_state.managed_companions,
    meta: {
      profile: normalizeProfile(asRecord(appState.meta)?.profile ?? fallback.profile),
      generated_at: asString(asRecord(appState.meta)?.generated_at) ?? fallback.app_state.meta.generated_at
    },
    provider: {
      ...asRecord(appState.provider),
      status: asString(asRecord(appState.provider)?.status) ?? fallback.app_state.provider.status
    },
    active_project_lines: Array.isArray(appState.active_project_lines)
      ? appState.active_project_lines.map((item) => {
          const line = asRecord(item);
          return {
            status: asString(line?.status) ?? "unknown",
            active_run_id: asString(line?.active_run_id) ?? "",
            next_visible_step: asString(line?.next_visible_step) ?? "Review current refs",
            progress_delta_classification: asString(line?.progress_delta_classification) ?? "platform_or_observability_delta",
            deliverable_progress_delta: asString(line?.deliverable_progress_delta) ?? "runtime refs available",
            platform_repair_delta: asString(line?.platform_repair_delta) ?? "none",
            next_forced_delta: asString(line?.next_forced_delta) ?? "human_confirmation_gate"
          };
        })
      : fallback.app_state.active_project_lines
  };
}

export function normalizeStateReadback(value: unknown, profile = readRuntimeProfile()): OplStateReadback {
  const normalizedProfile = normalizeProfile(profile);
  const fallback = defaultStateReadback(normalizedProfile);
  const commandReadback = normalizeCommandReadback(
    value,
    stateCommand(normalizedProfile),
    ["opl", "app", "state", "--profile", normalizedProfile, "--json"]
  );
  const record = asRecord(value);
  const parsedState = parseJsonValue(commandReadback.stdout);
  const stateSource = asRecord(parsedState)
    ?? asRecord(record?.raw_state)
    ?? asRecord(record?.app_state)
    ?? record;
  const readback = record?.readback
    ? normalizeCommandReadback(record.readback, commandReadback.command, commandReadback.commandArgs)
    : commandReadback;
  // A failed owner read is not an empty account or package directory. Reject
  // it before normalization can replace the last successful model with defaults.
  if (readback.timedOut || readback.exitCode !== 0) {
    throw new Error(readback.timedOut ? "opl_state_read_timeout" : "opl_state_read_failed");
  }
  if (!stateSource || Array.isArray(stateSource)
    || (stateSource === record && (record?.readback !== undefined || record?.stdout !== undefined))) {
    throw new Error("opl_state_read_failed");
  }
  return {
    profile: normalizedProfile,
    app_state: normalizeStateObject(stateSource, fallback),
    readback,
    carrierDiagnostics: normalizeCarrierDiagnostics(record?.carrierDiagnostics ?? record?.carrier_diagnostics),
    ...(asRecord(record?.managedUpdateMaintenance)?.schema === "opl_studio_update_maintenance.v1"
      ? { managedUpdateMaintenance: record?.managedUpdateMaintenance as OplStateReadback["managedUpdateMaintenance"] } : {})
  };
}

// Cold desktop startup can race the Framework bootstrap. Recover only owner
// reads, with a fixed limit; a newer read cancels the old startup retry.
export async function readStartupState<T>(read: () => Promise<T>, isCurrent: () => boolean): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!isCurrent()) return null;
    try {
      return await read();
    } catch (error) {
      if (!isCurrent()) return null;
      if (attempt === 2 || !(error instanceof Error)
        || !["opl_state_read_failed", "opl_state_read_timeout"].includes(error.message)) throw error;
      await new Promise<void>(resolve => setTimeout(resolve, (attempt + 1) * 1000));
    }
  }
  return null;
}

export function normalizeFullDrilldownReadback(value: unknown): OplFullDrilldownReadback {
  const fallback = defaultFullDrilldown();
  const record = asRecord(value);
  const readback = normalizeCommandReadback(record?.readback ?? value, OPL_COMMANDS.fullDrilldown, []);
  const drilldown = asRecord(record?.drilldown) ?? asRecord(parseJsonValue(readback.stdout));
  if (!drilldown && readback.exitCode === 0) return fallback;
  return { detail: "full", drilldown: drilldown ?? fallback.drilldown, readback };
}
