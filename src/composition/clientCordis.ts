import { Context } from "@deepseek-ai/cordis";
import {
  OPL_UI_CONTRIBUTION_SLOTS,
  emptyUiContributionsProjection,
  readUiContributionsProjection,
  type OplUiContribution,
  type OplUiContributionsProjection,
  type OplUiContributionSlot
} from "./contributionProjection";

export const OPL_CLIENT_CONTRIBUTIONS_SERVICE = "opl.app.client-contributions";
export const OPL_CLIENT_CONTRIBUTIONS_UPDATED_EVENT = "opl/app-client-contributions/updated";

export type OplStudioDetailTab = {
  id: "opl-project-progress-panel" | "opl-files-results-panel" | "opl-agents-capabilities-panel";
  order: number;
  icon: "progress" | "files" | "capabilities";
  labels: { zh: string; en: string };
};

export const OPL_STUDIO_DETAIL_TABS: readonly OplStudioDetailTab[] = Object.freeze([
  Object.freeze({ id: "opl-project-progress-panel", order: 10, icon: "progress", labels: Object.freeze({ zh: "项目进度", en: "Project progress" }) }),
  Object.freeze({ id: "opl-files-results-panel", order: 20, icon: "files", labels: Object.freeze({ zh: "文件与结果", en: "Files & results" }) }),
  Object.freeze({ id: "opl-agents-capabilities-panel", order: 30, icon: "capabilities", labels: Object.freeze({ zh: "智能体与能力", en: "Agents & capabilities" }) })
]);

export type OplClientCompositionPolicy = {
  abi: "opl_app_client_contributions.v1";
  projectionSchema: "opl_app_ui_contributions_projection.v1";
  slots: readonly OplUiContributionSlot[];
  stateRpc: "opl app state --profile fast --json";
  actionRpc: "opl app action execute --action <action_id> [--payload json] [--dry-run] --json";
  event: "opl/app-client-contributions/updated";
  stateSemanticsContract: "contracts/app-runtime-bridge.json";
  brandCapabilityProjectionPolicy: "dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client";
};

export type OplClientContributionsService = {
  readonly policy: OplClientCompositionPolicy;
  readonly detailsTabs: readonly OplStudioDetailTab[];
  updateHostState(state: unknown): OplUiContributionsProjection;
  readProjection(): OplUiContributionsProjection;
  readSlot(slot: OplUiContributionSlot): readonly OplUiContribution[];
  subscribe(listener: (projection: OplUiContributionsProjection) => void): () => void;
};

declare global {
  // The renderer build injects this object from the App-owned product profile.
  var __OPL_CLIENT_COMPOSITION_POLICY__: unknown;
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    [OPL_CLIENT_CONTRIBUTIONS_SERVICE]: OplClientContributionsService;
  }

  interface Events {
    [OPL_CLIENT_CONTRIBUTIONS_UPDATED_EVENT](projection: OplUiContributionsProjection): void;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function compositionModel(value: unknown): Record<string, unknown> | null {
  const root = asRecord(value);
  const topology = asRecord(root?.delivery_topology);
  const minimumProduct = asRecord(topology?.minimum_complete_product);
  return asRecord(minimumProduct?.composition_model) ?? root;
}

function compatibilityModel(value: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(value)?.client_renderer_compatibility);
}

function sameSlots(value: unknown): value is OplUiContributionSlot[] {
  return Array.isArray(value)
    && value.length === OPL_UI_CONTRIBUTION_SLOTS.length
    && new Set(value).size === value.length
    && OPL_UI_CONTRIBUTION_SLOTS.every((slot) => value.includes(slot));
}

export function readOplClientCompositionPolicy(
  value: unknown = globalThis.__OPL_CLIENT_COMPOSITION_POLICY__
): OplClientCompositionPolicy {
  const composition = compositionModel(value);
  const compatibility = compatibilityModel(value);
  const slots = composition?.package_contribution_slots;
  const compatibilitySlots = compatibility?.typed_slots;
  const consumers = composition?.shared_shell_consumers;
  const invalid = !composition
    || composition.app_client_contribution_abi !== "opl_app_client_contributions.v1"
    || composition.framework_host_graph_source !== "app_state.ui_contributions"
    || composition.framework_host_projection_schema !== "opl_app_ui_contributions_projection.v1"
    || composition.host_projection_graph_policy !== "allowlisted_closed_graph_from_framework_projection_only"
    || composition.host_projection_allowlist_contract !== "contracts/opl-app-contributions.schema.json"
    || composition.typed_slot_policy !== "mount_only_app_product_profile_declared_slots"
    || composition.typed_action_policy !== "action_refs_only_via_canonical_app_action_bridge"
    || composition.framework_host_composition_authority !== "one-person-lab-framework"
    || composition.app_authority_policy !== "one-person-lab-app_owns_product_profile_gui_abi_active_shell_and_release"
    || composition.framework_projection_runtime_status !== "framework_host_projection_active"
    || composition.shared_transport_policy !== "framework_host_projected_typed_rpc_reads_typed_events_and_canonical_app_actions"
    || composition.shared_product_state_semantics !== true
    || composition.package_gui_contribution_policy !== "app_schema_admitted_declarative_only_then_framework_host_projected"
    || composition.client_authority_policy !== "render_and_dispatch_only_no_plugin_discovery_install_registry_currentness_release_operation_task_package_or_product_truth"
    || composition.client_cordis_graph !== "derived_from_framework_host_graph_and_app_product_profile_slot_policy"
    || composition.client_renderer_compatibility_profile !== "client_renderer_compatibility"
    || composition.client_renderer_switch_policy !== "explicit_adapter_selection_after_compatibility_admission_never_unverified_hot_switch"
    || composition.brand_capability_projection_policy !== "dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client"
    || composition.independent_host_truth_allowed !== false
    || composition.second_client_composition_graph_allowed !== false
    || composition.second_package_registry_allowed !== false
    || composition.second_currentness_authority_allowed !== false
    || composition.second_state_or_action_truth_allowed !== false
    || compatibility?.schema !== "opl_app_client_renderer_compatibility.v1"
    || compatibility.owner !== "one-person-lab-app"
    || compatibility.host_composition_authority !== "one-person-lab-framework"
    || compatibility.host_graph_source !== composition.framework_host_graph_source
    || compatibility.host_projection_schema !== composition.framework_host_projection_schema
    || compatibility.contribution_abi !== composition.app_client_contribution_abi
    || compatibility.allowlist_contract !== composition.host_projection_allowlist_contract
    || compatibility.typed_state_rpc !== "opl app state --profile fast --json"
    || compatibility.typed_action_rpc !== "opl app action execute --action <action_id> [--payload json] [--dry-run] --json"
    || compatibility.typed_client_event !== OPL_CLIENT_CONTRIBUTIONS_UPDATED_EVENT
    || compatibility.state_semantics_contract !== "contracts/app-runtime-bridge.json"
    || compatibility.client_authority_policy !== composition.client_authority_policy
    || compatibility.switch_policy !== composition.client_renderer_switch_policy
    || compatibility.hot_switch_without_revalidation_allowed !== false
    || compatibility.brand_capability_projection_policy !== composition.brand_capability_projection_policy
    || compatibility.app_fixed_brand_registry_allowed !== false
    || compatibility.client_fixed_brand_registry_allowed !== false
    || compatibility.display_and_allowlist_owner !== "one-person-lab-app"
    || !sameSlots(slots)
    || !sameSlots(compatibilitySlots)
    || !Array.isArray(consumers)
    || !consumers.includes("opl-aion-shell")
    || !consumers.includes("opl-studio");

  if (invalid) {
    throw new Error("Invalid OPL Client Cordis policy in the App product profile");
  }

  return Object.freeze({
    abi: "opl_app_client_contributions.v1",
    projectionSchema: "opl_app_ui_contributions_projection.v1",
    slots: Object.freeze([...slots]),
    stateRpc: "opl app state --profile fast --json",
    actionRpc: "opl app action execute --action <action_id> [--payload json] [--dry-run] --json",
    event: OPL_CLIENT_CONTRIBUTIONS_UPDATED_EVENT,
    stateSemanticsContract: "contracts/app-runtime-bridge.json",
    brandCapabilityProjectionPolicy: "dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client"
  });
}

function createContributionsService(
  ctx: Context,
  policy: OplClientCompositionPolicy
): OplClientContributionsService {
  let projection = emptyUiContributionsProjection;
  let fingerprint = JSON.stringify(projection);

  return Object.freeze({
    policy,
    detailsTabs: OPL_STUDIO_DETAIL_TABS,
    updateHostState(state: unknown) {
      const parsed = readUiContributionsProjection(state);
      const next: OplUiContributionsProjection = {
        ...parsed,
        entries: parsed.entries.filter((entry) => policy.slots.includes(entry.slot))
      };
      const nextFingerprint = JSON.stringify(next);
      if (nextFingerprint === fingerprint) return projection;
      projection = next;
      fingerprint = nextFingerprint;
      ctx.emit(OPL_CLIENT_CONTRIBUTIONS_UPDATED_EVENT, projection);
      return projection;
    },
    readProjection() {
      return projection;
    },
    readSlot(slot: OplUiContributionSlot) {
      if (!policy.slots.includes(slot)) return [];
      return projection.entries.filter((entry) => entry.slot === slot);
    },
    subscribe(listener: (next: OplUiContributionsProjection) => void) {
      return ctx.on(OPL_CLIENT_CONTRIBUTIONS_UPDATED_EVENT, listener);
    }
  });
}

export function provideOplStudioClientContributions(
  ctx: Context,
  policy: OplClientCompositionPolicy = readOplClientCompositionPolicy()
): OplClientContributionsService {
  const service = createContributionsService(ctx, policy);
  ctx.provide(OPL_CLIENT_CONTRIBUTIONS_SERVICE, service);
  return service;
}

const clientContributionsPlugin = {
  name: "opl-studio-client-contributions",
  provide: OPL_CLIENT_CONTRIBUTIONS_SERVICE,
  apply(ctx: Context, config: { policy: OplClientCompositionPolicy }) {
    provideOplStudioClientContributions(ctx, config.policy);
  }
};

export async function createOplStudioClientCordisComposition(
  profile: unknown = globalThis.__OPL_CLIENT_COMPOSITION_POLICY__
) {
  const ctx = new Context();
  const policy = readOplClientCompositionPolicy(profile);
  const fiber = await ctx.plugin(clientContributionsPlugin, { policy });
  return {
    ctx,
    fiber,
    contributions: ctx[OPL_CLIENT_CONTRIBUTIONS_SERVICE],
    async dispose() {
      await fiber.dispose();
      await ctx.fiber.dispose();
    }
  };
}
