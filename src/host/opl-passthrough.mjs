import { frameworkUpdateEnvironment } from "./framework-update-compatibility.mjs";
import { readOfficialProfileResources, restoreOfficialProfile } from "../../desktop/official-profile.mjs";

import {
  boundedReadback,
  boundedTimeout,
  commandReadback,
  frameworkActionPayload,
  jsonValue,
  run
} from "./opl-passthrough-parts/command-runtime.mjs";
import {
  compactAction,
  compactHomeShortcutPreferences,
  compactManagedUpdateProjection,
  compactPackageRows,
  compactSoftwareSources,
  compactUiContributions,
  selectedFields
} from "./opl-passthrough-parts/contributions-packages.mjs";
// Package readback keeps the bounded dependency_readiness projection in its lower owner.
import {
  compactCodexPersonalization,
  compactCore,
  compactProvider,
  compactRuntimeSourceCarriers,
  compactSettingsReadModel
} from "./opl-passthrough-parts/settings-provider.mjs";
import { compactInitialize, compactWorkItemProjection } from "./opl-passthrough-parts/workitems-initialize.mjs";
import {
  channelAccessEntry,
  hostActionReceipt,
  mergeChannelProviderState,
  validateChannelCallbackAdapter,
  validateChannelProviderHost
} from "./opl-passthrough-parts/channel-provider.mjs";

function firstRecords(value, limit = 8) {
  if (Array.isArray(value)) return value.slice(0, limit);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, limit));
  return value;
}

function compactFastApplicationManagementProjection(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const sourceRefs = Array.isArray(value.source_refs)
    ? value.source_refs.filter((entry) => typeof entry === "string").slice(0, 16)
    : [];
  const sharedResources = Array.isArray(value.shared_resources)
    ? value.shared_resources.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)).slice(0, 100)
    : [];
  return {
    surface_kind: "opl_application_management_projection.v1",
    schema_version: "opl_application_management_projection.v1",
    source_refs: sourceRefs,
    shared_resources: sharedResources,
    authority_boundary: value.authority_boundary && typeof value.authority_boundary === "object" && !Array.isArray(value.authority_boundary)
      ? value.authority_boundary
      : {},
    detail_policy: {
      detail: "startup",
      full_detail_surface: "opl app state --profile full --json#application_management"
    }
  };
}

// The startup budget applies to unrelated catalog entries, not to actions that
// a retained view offers. Resolve those references against the owner catalog;
// never manufacture an executable action from a projection or payload.
function retainProjectedActions(state, actionCatalog, taskCatalog) {
  const actions = Array.isArray(actionCatalog) ? actionCatalog : [];
  const tasks = Array.isArray(taskCatalog) ? taskCatalog : [];
  const byId = new Map(actions.filter((action) => typeof action?.action_id === "string")
    .map((action) => [action.action_id, action]));
  const tasksByAction = new Map();
  for (const task of tasks) {
    if (typeof task?.action_id !== "string") continue;
    const matching = tasksByAction.get(task.action_id) ?? [];
    matching.push(task);
    tasksByAction.set(task.action_id, matching);
  }
  const selected = new Set();
  const pending = [];
  const add = (value) => {
    if (typeof value !== "string") return;
    const id = value.startsWith("app_state.actions#") ? value.slice("app_state.actions#".length) : value;
    if (!byId.has(id) || selected.has(id)) return;
    selected.add(id);
    pending.push(id);
  };
  const inspect = (value, actionValues = false) => {
    if (typeof value === "string") { if (actionValues || value.startsWith("app_state.actions#")) add(value); return; }
    if (Array.isArray(value)) { value.forEach((entry) => inspect(entry, actionValues)); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      if (key === "payload" || key === "default_payload") continue;
      inspect(entry, actionValues || /(^|_)action_ids?$/.test(key)
        || key === "action_ref" || key === "actions" || key === "next_action" || key === "recommended_action");
    }
  };
  actions.slice(0, 100).forEach((action) => add(action?.action_id));
  inspect(state);
  for (let index = 0; index < pending.length; index += 1) {
    const id = pending[index];
    inspect(byId.get(id));
    for (const task of tasksByAction.get(id) ?? []) inspect(task);
  }
  state.actions = actions.filter((action) => selected.has(action?.action_id)).map(compactAction);
  if (state.settings_control_center) {
    state.settings_control_center.task_entries = tasks.filter((task, index) => index < 64 || selected.has(task?.action_id));
  }
}

function compactFastState(value) {
  const root = value && typeof value === "object" ? value : {};
  const appState = root.app_state && typeof root.app_state === "object" ? root.app_state : root;
  const agentPackages = appState.agent_packages && typeof appState.agent_packages === "object" ? appState.agent_packages : undefined;
  const directory = agentPackages?.directory && typeof agentPackages.directory === "object" ? agentPackages.directory : undefined;
  const statusIndex = agentPackages?.status_index && typeof agentPackages.status_index === "object" ? agentPackages.status_index : undefined;
  const operator = appState.operator && typeof appState.operator === "object" ? appState.operator : undefined;
  const workbench = operator?.workbench && typeof operator.workbench === "object" ? operator.workbench : undefined;
  const settings = appState.settings_control_center && typeof appState.settings_control_center === "object"
    ? appState.settings_control_center
    : undefined;
  const compact = {
    ...(root.version !== undefined ? { version: root.version } : {}),
    app_state: {
      schema_version: appState.schema_version,
      surface_kind: appState.surface_kind,
      runtime_source: appState.runtime_source,
      meta: appState.meta,
      managed_update: compactManagedUpdateProjection(appState.managed_update),
      application_management: compactFastApplicationManagementProjection(appState.application_management),
      core: compactCore(appState.core),
      provider: compactProvider(appState.provider),
      runtime_source_carriers: compactRuntimeSourceCarriers(appState.runtime_source_carriers),
      codex_personalization: compactCodexPersonalization(appState.codex_personalization),
      ui_contributions: compactUiContributions(appState.ui_contributions),
      transport_bindings: appState.transport_bindings,
      workbench_services: appState.workbench_services,
      active_project_lines: firstRecords(appState.active_project_lines, 12),
      home_agent_shortcuts: compactHomeShortcutPreferences(appState.home_agent_shortcuts, 16),
      modules: { items: firstRecords(appState.modules?.items, 8) ?? [] },
      actions: [],
      operator: operator ? {
        summary: operator.summary,
        refs: firstRecords(operator.refs, 16) ?? [],
        workbench: workbench ? {
          task_drilldowns: firstRecords(workbench.task_drilldowns, 8) ?? [],
          work_item_projection_v2: compactWorkItemProjection(workbench.work_item_projection_v2),
          safe_action_routes: firstRecords(workbench.safe_action_routes, 32) ?? [],
          current_owner_delta: workbench.current_owner_delta,
          current_owner_delta_next_action: workbench.current_owner_delta_next_action
        } : undefined
      } : undefined,
      settings_control_center: settings ? {
        surface_kind: settings.surface_kind,
        schema_version: settings.schema_version,
        profile: settings.profile,
        status_summary: selectedFields(settings.status_summary, [
          "model_access", "codex_version", "runtime_source_carrier_health", "agent_package_functional_health",
          "temporal_provider", "release_channel", "issue_count"
        ]),
        app_settings_read_model: compactSettingsReadModel(settings.app_settings_read_model),
        task_entries: firstRecords(settings.task_entries, 64) ?? [],
        action_sections: firstRecords(settings.action_sections, 32) ?? []
      } : undefined,
      agent_packages: agentPackages ? {
        surface_kind: agentPackages.surface_kind,
        source: agentPackages.source,
        sources: compactSoftwareSources(agentPackages.sources),
        directory: directory ? {
          status: directory.status,
          entry_count: directory.entry_count,
          installed_package_count: directory.installed_package_count,
          installable_package_count: directory.installable_package_count,
          migration_required_count: directory.migration_required_count,
          source_catalog_kind: directory.source_catalog_kind,
          files: selectedFields(directory.files, ["home_shortcut_preferences_file"]),
          home_shortcut_preferences: compactHomeShortcutPreferences(directory.home_shortcut_preferences, 16),
          entries: compactPackageRows(directory.entries, 64) ?? []
        } : undefined,
        status_index: statusIndex ? {
          installed_package_count: statusIndex.installed_package_count,
          files: statusIndex.files,
          home_shortcut_preferences: compactHomeShortcutPreferences(statusIndex.home_shortcut_preferences, 16),
          packages: compactPackageRows(statusIndex.packages, 64)
        } : undefined
      } : undefined
    }
  };
  retainProjectedActions(compact.app_state, appState.actions, settings?.task_entries);
  return compact;
}

export { compactFastState, compactInitialize, mergeChannelProviderState };

export function createOplPassthrough({
  env = process.env,
  cwd = process.cwd(),
  command = env.OPL_APP_OPL_BIN ?? env.OPL_COMMAND ?? "opl",
  readStateTimeoutMs = env.OPL_APP_STATE_TIMEOUT_MS,
  allowActions = env.OPL_NATIVE_WORKBENCH_READ_ONLY === "0"
    || env.OPL_STUDIO_READ_ONLY === "0",
  candidateActionAllowlist = [],
  channelCallbackRegistrar
} = {}) {
  const stateTimeoutMs = boundedTimeout(readStateTimeoutMs, 30_000);
  if (!Array.isArray(candidateActionAllowlist) || candidateActionAllowlist.some((actionId) => typeof actionId !== "string" || !actionId.trim())) {
    throw Object.assign(new Error("candidateActionAllowlist must contain non-empty action IDs"), { code: "invalid_request" });
  }
  const allowedCandidateActions = new Set([
    "settings_diagnose_docker_webui",
    "settings_inventory_agent_package_store",
    "settings_inventory_webui_data_volume",
    "codex_user_instructions_set",
    "codex_user_instructions_restore_opl_flow_default",
    ...candidateActionAllowlist.map((actionId) => actionId.trim())
  ]);
  if (channelCallbackRegistrar !== undefined && typeof channelCallbackRegistrar !== "function") {
    throw Object.assign(new Error("channel callback registrar must be a function"), { code: "invalid_request" });
  }
  let channelProviderHost = null;
  let workbenchHost = null;
  let workbenchError = 'Framework workbench services have not initialized.';
  return {
    async registerWorkbenchServices(bootstrap) {
      let candidate;
      try {
        candidate = await bootstrap();
        for (const method of ['appStatePatch', 'read', 'execute', 'dispose']) if (typeof candidate?.[method] !== 'function') throw Error('Unsupported workbench host.');
        if (candidate.appStatePatch()?.workbench_services?.schema_version !== 'opl-workbench-services.v1') throw Error('Unsupported workbench schema.');
        await workbenchHost?.dispose();
        workbenchHost = candidate; workbenchError = '';
      }
      catch {
        if (typeof candidate?.dispose === 'function') { try { await candidate.dispose(); } catch {} }
        workbenchError = 'Framework workbench services are unavailable. Update Framework and restart the App.';
      }
    },
    async closeWorkbenchServices() { await workbenchHost?.dispose(); workbenchHost = null; },
    async runStartupMaintenance() {
      if (env.OPL_STUDIO_READ_ONLY === "1" || env.OPL_NATIVE_WORKBENCH_READ_ONLY === "1") {
        throw Object.assign(new Error("Startup maintenance is disabled in read-only mode"), { code: "blocked_read_only" });
      }
      const result = await run(command, ["system", "startup-maintenance", "--scope", "runtime_recovery", "--json"], {
        cwd, env, timeoutMs: 120_000
      });
      const parsed = jsonValue(result.stdout);
      if (result.exitCode !== 0 || !parsed) {
        throw Object.assign(new Error("Framework startup maintenance failed"), {
          code: result.timedOut ? "startup_maintenance_timeout" : "startup_maintenance_failed"
        });
      }
      return parsed;
    },
    async runManagedUpdate(operation) {
      if (!["activate", "check", "plan", "apply", "status"].includes(operation)) {
        throw new Error("Unsupported managed update operation");
      }
      if (["activate", "apply"].includes(operation)
        && (env.OPL_STUDIO_READ_ONLY === "1" || env.OPL_NATIVE_WORKBENCH_READ_ONLY === "1")) {
        throw Object.assign(new Error("Managed updates are disabled in read-only mode"), { code: "blocked_read_only" });
      }
      const updateEnv = ["activate", "apply"].includes(operation)
        ? await frameworkUpdateEnvironment(env, {
          operation, plan: operation === "apply" ? await this.runManagedUpdate("plan") : undefined
        }) : env;
      const result = await run(command, ["update", operation, "--json"], {
        cwd, env: updateEnv, timeoutMs: operation === "apply" ? 20 * 60_000 : operation === "activate" ? 120_000 : 90_000
      });
      const parsed = jsonValue(result.stdout);
      if (result.exitCode !== 0 || !parsed) {
        throw Object.assign(new Error(`Framework update ${operation} failed`), {
          code: result.timedOut ? "managed_update_timeout" : "managed_update_failed"
        });
      }
      return parsed;
    },

    async registerChannelCallbackAdapter(adapter) {
      const validated = validateChannelCallbackAdapter(adapter);
      if (typeof channelCallbackRegistrar !== "function") {
        return { status: "dormant", registered: false, dispose: async () => {} };
      }
      const candidate = await channelCallbackRegistrar(validated);
      let registration;
      try {
        registration = validateChannelProviderHost(candidate);
      } catch (error) {
        await candidate?.dispose?.();
        throw error;
      }
      channelProviderHost = registration;
      let disposed = false;
      return {
        status: registration?.status ?? "registered",
        registered: true,
        dispose: async () => {
          if (disposed) return;
          disposed = true;
          if (channelProviderHost === registration) channelProviderHost = null;
          await registration.dispose();
        }
      };
    },

    async readState(profile = "fast") {
      const normalizedProfile = profile === "full" ? "full" : "fast";
      const args = [command, "app", "state", "--profile", normalizedProfile, "--json"];
      let result = await run(command, args.slice(1), { cwd, env, timeoutMs: stateTimeoutMs });
      if (normalizedProfile === "fast" && result.exitCode === 0) {
        const sources = jsonValue(result.stdout)?.app_state?.agent_packages?.sources?.entries;
        const refreshIds = new Set(Array.isArray(sources) ? sources.filter(source =>
          (source?.access_refresh_required === true || source?.inventory_refresh_required === true)
          && typeof source.source_id === "string" && source.source_id.trim()
          && Array.isArray(source.available_actions) && source.available_actions.some(action =>
            action?.action_id === "source_check" && (action.status === undefined || action.status === "available")
            && action.confirmation_required !== true)
        ).map(source => source.source_id) : []);
        for (const sourceId of refreshIds) {
          await run(command, ["sources", "check", "--source-id", sourceId, "--json"], { cwd, env, timeoutMs: stateTimeoutMs });
        }
        // Publish one owner readback after its requested source checks. The owner
        // decides freshness and cooldown; this read never recursively retries.
        if (refreshIds.size) result = await run(command, args.slice(1), { cwd, env, timeoutMs: stateTimeoutMs });
      }
      const base = mergeChannelProviderState(jsonValue(result.stdout), channelProviderHost);
      const patch = workbenchHost?.appStatePatch() ?? { workbench_services: { schema_version: 'opl-workbench-services.v1', status: 'owner_action_required', reason: workbenchError } };
      let parsed = base?.app_state ? { ...base, app_state: { ...base.app_state, ...patch } } : base;
      if (parsed?.app_state && env.OPL_OFFICIAL_PROFILE_RESOURCES) {
        try {
          const resources = readOfficialProfileResources(env.OPL_OFFICIAL_PROFILE_RESOURCES);
          if (resources.restoreAllowed) parsed = { ...parsed, app_state: { ...parsed.app_state, actions: [
            ...(parsed.app_state.actions ?? []).filter(action => action.action_id !== "official_profile_restore"),
            { action_id: "official_profile_restore", label: "Restore official combination", owner: "one-person-lab-app",
              route: "opl-studio:official-profile-restore", payload_fields: ["intent"], mutates: "opl_packages",
              confirmation_required: true, dry_run_supported: true }
          ] } };
        } catch { /* Invalid or absent App resources cannot authorize a restore. */ }
      }
      return {
        profile: normalizedProfile,
        app_state: normalizedProfile === "fast" ? compactFastState(parsed) : parsed,
        readback: boundedReadback(args, result)
      };
    },

    async readInitialize() {
      const args = [command, "system", "initialize", "--json"];
      const result = await run(command, args.slice(1), { cwd, env, timeoutMs: 60_000 });
      return {
        ...compactInitialize(jsonValue(result.stdout)),
        readback: boundedReadback(args, result)
      };
    },

    async readFullDrilldown() {
      const args = [command, "runtime", "app-operator-drilldown", "--detail", "full", "--json"];
      const result = await run(command, args.slice(1), { cwd, env, timeoutMs: 45_000 });
      return { detail: "full", drilldown: jsonValue(result.stdout), readback: commandReadback(args, result) };
    },

    async readDomainDetailView(request = {}) {
      const itemId = typeof request.itemId === "string" ? request.itemId.trim() : "";
      const viewId = typeof request.viewId === "string" ? request.viewId.trim() : "";
      if (!itemId || !viewId) {
        throw Object.assign(new Error("missing itemId or viewId"), { code: "invalid_request" });
      }
      const args = [command, "app", "view", "read", "--item-id", itemId, "--view-id", viewId];
      if (request.ifRevision !== undefined) {
        if (!Number.isInteger(request.ifRevision) || request.ifRevision < 0) {
          throw Object.assign(new Error("ifRevision must be a non-negative integer"), { code: "invalid_request" });
        }
        args.push("--if-revision", String(request.ifRevision));
      }
      args.push("--json");
      const result = await run(command, args.slice(1), { cwd, env, timeoutMs: 45_000 });
      return { ...commandReadback(args, result), stdoutJson: jsonValue(result.stdout) };
    },

    async readContribution(request = {}) {
      const packageId = typeof request.packageId === "string" ? request.packageId.trim() : "";
      const ref = typeof request.ref === "string" ? request.ref.trim() : "";
      if (!packageId || !ref) throw Object.assign(new Error("missing packageId or ref"), { code: "invalid_request" });
      const input = request.input && typeof request.input === "object" ? request.input : {};
      if (packageId === 'opl-workbench-services') {
        if (!workbenchHost) throw Error(workbenchError);
        const result = await workbenchHost.read({ package_id: packageId, ref, input });
        return { command: 'opl-workbench-services', commandArgs: [], exitCode: 0, stdout: '', stderr: '', timedOut: false,
          stdoutJson: { opl_app_contribution: { surface_kind: 'opl_app_package_contribution.v1', package_id: packageId, ref, operation: 'read',
            response: { schema_version: 'opl-package-app-contribution-response.v1', ok: true, ref, operation: 'read', result } } } };
      }
      if (channelAccessEntry(channelProviderHost, packageId, ref, "read")) {
        const stdoutJson = await channelProviderHost.readChannelAccess({
          package_id: packageId,
          ref,
          input
        });
        return {
          command: "opl.connect.channel-provider-host",
          commandArgs: [],
          exitCode: 0,
          stdout: "",
          stderr: "",
          timedOut: false,
          stdoutJson
        };
      }
      if (ref.startsWith("remote_companion_access#")) {
        return {
          command: "opl.connect.remote-companion-connector-host",
          commandArgs: [],
          exitCode: 0,
          stderr: "",
          timedOut: false,
          stdout: "",
          stdoutJson: {
            opl_app_contribution: {
              surface_kind: "opl_app_package_contribution.v1",
              package_id: packageId,
              ref,
              operation: "read",
              confirmation_required: false,
              readiness: { installed: true, physical_status: "available", callability: "disabled" },
              response: {
                schema_version: "opl-package-app-contribution-response.v1",
                ok: true,
                ref,
                operation: "read",
                result: {
                  schema_version: "opl-app-remote-companion-access.v1",
                  status: "unavailable",
                  unavailable_reason: "implementation_in_progress",
                  actions: []
                }
              }
            }
          }
        };
      }
      const args = [command, "app", "contribution", "read", "--package-id", packageId, "--ref", ref, "--input", JSON.stringify(input), "--json"];
      const result = await run(command, args.slice(1), { cwd, env, timeoutMs: 45_000 });
      return { ...commandReadback(args, result), stdoutJson: jsonValue(result.stdout) };
    },

    async executeAction(request = {}) {
      const actionId = typeof request.actionId === "string" ? request.actionId.trim() : "";
      if (!actionId) throw Object.assign(new Error("missing actionId"), { code: "invalid_request" });
      const nativeSourceAction = ["source_setup", "source_refresh", "source_install", "source_update", "source_uninstall"].includes(actionId);
      const payload = request.payload && typeof request.payload === "object" ? request.payload : {};
      if (actionId === "official_profile_restore") {
        const dryRun = request.dryRun !== false;
        const base = { ...hostActionReceipt(request, null), dryRun, confirmationRequired: dryRun,
          receiptKind: dryRun ? "preview" : "execute", requestedMode: dryRun ? "preview" : "execute",
          command: "opl-studio:official-profile-restore" };
        try {
          if (payload.intent !== "explicit_restore") throw new Error("Explicit restore intent is required");
          if (!dryRun && (!allowActions || env.OPL_STUDIO_READ_ONLY === "1" || env.OPL_NATIVE_WORKBENCH_READ_ONLY === "1")) throw new Error("Official Profile restoration is disabled in read-only mode");
          if (!dryRun && payload.confirmed !== true) throw new Error("confirmation_required");
          if (!env.OPL_OFFICIAL_PROFILE_RESOURCES) throw new Error("Official Profile resources are unavailable in this installation");
          const result = await restoreOfficialProfile({ resourcesPath: env.OPL_OFFICIAL_PROFILE_RESOURCES, env, dryRun });
          return { ...base, status: result.status === "failed" ? "error" : dryRun ? "preview_ready" : "executed",
            exitCode: result.status === "failed" ? 1 : 0, stdoutJson: result,
            ...(result.status === "failed" ? { blockedReason: result.package_results.filter(item => item.status === "failed").map(item => `${item.package_id}: ${item.error?.message ?? "failed"}`).join("; ") } : {}) };
        } catch (error) { return { ...base, status: "error", canExecute: false, exitCode: 1, blockedReason: error.message }; }
      }
      const packageId = typeof payload.package_id === "string" ? payload.package_id.trim() : "";
      const ref = typeof payload.ref === "string" ? payload.ref.trim() : "";
      if (actionId === 'package_contribution_execute' && packageId === 'opl-workbench-services') {
        const dryRun = request.dryRun !== false;
        try {
          if (!workbenchHost) throw Error(workbenchError);
          if (!dryRun && (env.OPL_STUDIO_READ_ONLY === '1' || env.OPL_NATIVE_WORKBENCH_READ_ONLY === '1')) throw Error('Workbench actions are disabled in read-only mode.');
          const value = await workbenchHost.execute({ package_id: packageId, ref, input: payload.input ?? {},
            dryRun, confirmed: payload.confirmed === true, confirmationId: payload.confirmationId });
          return { ...hostActionReceipt(request, value), dryRun, status: value.status, receiptKind: dryRun ? 'preview' : 'execute',
            requestedMode: dryRun ? 'preview' : 'execute', confirmationRequired: dryRun, confirmationId: value.confirmationId,
            receiptId: value.receiptId, command: 'opl-workbench-services', exitCode: value.status === 'failed' ? 1 : 0,
            result: value.result };
        } catch (error) {
          return { ...hostActionReceipt(request, null), dryRun, status: 'failed', canExecute: false,
            receiptKind: dryRun ? 'preview' : 'execute', command: 'opl-workbench-services', exitCode: 1,
            stderr: String(error.message), blockedReason: String(error.message) };
        }
      }
      if (
        actionId === "package_contribution_execute"
        && request.dryRun === false
        && packageId
        && ref
        && channelAccessEntry(channelProviderHost, packageId, ref, "execute")
      ) {
        const result = await channelProviderHost.executeChannelAccessAction({
          package_id: packageId,
          ref,
          input: payload.input && typeof payload.input === "object" ? payload.input : {},
          confirmed: payload.confirmed === true
        });
        return hostActionReceipt(request, result);
      }
      const dryRun = request.dryRun !== false;
      const confirmed = payload.confirmed === true;
      const rollbackRef = typeof payload.rollbackRef === "string" ? payload.rollbackRef : undefined;
      const requestedMode = request.mode === "rollback" || request.mode === "execute" ? request.mode : "preview";
      const candidateAllowedAction = allowedCandidateActions.has(actionId);
      const actionExecutionAllowed = (allowActions || candidateAllowedAction)
        && env.OPL_STUDIO_READ_ONLY !== "1" && env.OPL_NATIVE_WORKBENCH_READ_ONLY !== "1";
      const blockedReadOnly = !dryRun && !actionExecutionAllowed;
      const receiptKind = blockedReadOnly
        ? "blocked_read_only"
        : !dryRun && !confirmed
        ? "confirmation_required"
        : (requestedMode === "rollback" || rollbackRef ? "rollback" : (dryRun ? "preview" : "execute"));
      const args = [command, "app", "action", "execute", "--action", actionId];
      const actionPayload = frameworkActionPayload(payload);
      if (Object.keys(actionPayload).length) args.push("--payload", JSON.stringify(actionPayload));
      if (dryRun) args.push("--dry-run");
      args.push("--json");
      const result = blockedReadOnly
        ? { exitCode: -1, stdout: "", stderr: "candidate_read_only_policy", timedOut: false }
        : !dryRun && !confirmed
        ? { exitCode: -1, stdout: "", stderr: "confirmation_required", timedOut: false }
        : await run(command, args.slice(1), { cwd, env,
          timeoutMs: nativeSourceAction || ["settings_apply_opl_base_update", "settings_apply_opl_packages", "agent_package_install", "agent_package_update", "agent_package_repair", "install_from_manifest_url"].includes(actionId)
            ? 20 * 60_000 : actionId === "codex_install" ? 120_000 : 45_000 });
      const ownerJson = jsonValue(result.stdout);
      const ownerExecution = ownerJson?.app_action_execution ?? ownerJson;
      const ownerStatus = ownerExecution?.result?.status ?? ownerExecution?.status;
      const nativeAction = ownerExecution?.result?.native_action;
      const nativeStatus = nativeSourceAction && nativeAction?.action_id === actionId
        ? nativeAction.status : undefined;
      const ownerFailure = ownerExecution?.success === false || ownerExecution?.result?.success === false
        || ["error", "failed", "blocked", "unavailable", "not_configured", "owner_action_required"].includes(ownerStatus)
        || nativeStatus === "needs_attention";
      return {
        actionId,
        dryRun,
        confirmationRequired: dryRun || (!dryRun && !confirmed),
        canExecute: dryRun || (actionExecutionAllowed && confirmed),
        receiptKind,
        authorityBoundary: "app_bridge_no_domain_authority",
        requestedMode,
        status: result.timedOut
          ? "timed_out"
          : (blockedReadOnly
              ? "blocked_read_only"
              : (!dryRun && !confirmed ? "confirmation_required" : (result.exitCode === 0 ? ownerFailure ? "error" : ownerStatus === "unsupported" ? "unsupported" : ["no_op", "noop"].includes(ownerStatus) || nativeStatus === "already_connected" ? "no_op" : (dryRun ? "preview_ready" : "executed") : "error"))),
        ...commandReadback(args, result),
        payload,
        stdoutJson: ownerJson,
        ...(ownerFailure ? { blockedReason: `owner_${nativeStatus === "needs_attention" ? nativeStatus : ownerStatus ?? "failed"}` } : {}),
        stderrJson: jsonValue(result.stderr),
        ...(payload.confirmationId ? { confirmationId: payload.confirmationId } : {}),
        ...(payload.receiptId ? { receiptId: payload.receiptId } : {}),
        ...(rollbackRef ? { rollbackRef } : {})
      };
    }
  };
}
