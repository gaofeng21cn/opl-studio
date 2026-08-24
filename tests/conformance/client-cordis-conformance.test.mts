import { describe, expect, test } from "bun:test";
import {
  OPL_CLIENT_CONTRIBUTIONS_SERVICE,
  OPL_CLIENT_CONTRIBUTIONS_UPDATED_EVENT,
  OPL_STUDIO_DETAIL_TABS,
  createOplStudioClientCordisComposition,
  readOplClientCompositionPolicy
} from "../../src/composition/clientCordis.ts";
import {
  createOplContributionActionRequest,
  readUiContributionsProjection
} from "../../src/composition/contributionProjection.ts";

const compositionModel = {
  package_contribution_slots: ["settings.section", "runtime.detail", "composer.palette"],
  app_client_contribution_abi: "opl_app_client_contributions.v1",
  framework_host_graph_source: "app_state.ui_contributions",
  framework_host_projection_schema: "opl_app_ui_contributions_projection.v1",
  host_projection_graph_policy: "allowlisted_closed_graph_from_framework_projection_only",
  host_projection_allowlist_contract: "contracts/opl-app-contributions.schema.json",
  typed_slot_policy: "mount_only_app_product_profile_declared_slots",
  typed_action_policy: "action_refs_only_via_canonical_app_action_bridge",
  framework_host_composition_authority: "one-person-lab-framework",
  app_authority_policy: "one-person-lab-app_owns_product_profile_gui_abi_active_shell_and_release",
  framework_projection_runtime_status: "framework_host_projection_active",
  shared_transport_policy: "framework_host_projected_typed_rpc_reads_typed_events_and_canonical_app_actions",
  shared_product_state_semantics: true,
  package_gui_contribution_policy: "app_schema_admitted_declarative_only_then_framework_host_projected",
  client_authority_policy: "render_and_dispatch_only_no_plugin_discovery_install_registry_currentness_release_operation_task_package_or_product_truth",
  client_cordis_graph: "derived_from_framework_host_graph_and_app_product_profile_slot_policy",
  client_renderer_compatibility_profile: "client_renderer_compatibility",
  client_renderer_switch_policy: "explicit_adapter_selection_after_compatibility_admission_never_unverified_hot_switch",
  brand_capability_projection_policy: "dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client",
  shared_shell_consumers: ["opl-aion-shell", "opl-studio"],
  independent_host_truth_allowed: false,
  second_client_composition_graph_allowed: false,
  second_package_registry_allowed: false,
  second_currentness_authority_allowed: false,
  second_state_or_action_truth_allowed: false
};

const clientRendererCompatibility = {
  schema: "opl_app_client_renderer_compatibility.v1",
  owner: "one-person-lab-app",
  host_composition_authority: "one-person-lab-framework",
  host_graph_source: "app_state.ui_contributions",
  host_projection_schema: "opl_app_ui_contributions_projection.v1",
  contribution_abi: "opl_app_client_contributions.v1",
  allowlist_contract: "contracts/opl-app-contributions.schema.json",
  typed_slots: ["settings.section", "runtime.detail", "composer.palette"],
  typed_state_rpc: "opl app state --profile fast --json",
  typed_action_rpc: "opl app action execute --action <action_id> [--payload json] [--dry-run] --json",
  typed_client_event: "opl/app-client-contributions/updated",
  state_semantics_contract: "contracts/app-runtime-bridge.json",
  client_authority_policy: "render_and_dispatch_only_no_plugin_discovery_install_registry_currentness_release_operation_task_package_or_product_truth",
  switch_policy: "explicit_adapter_selection_after_compatibility_admission_never_unverified_hot_switch",
  hot_switch_without_revalidation_allowed: false,
  brand_capability_projection_policy: "dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client",
  app_fixed_brand_registry_allowed: false,
  client_fixed_brand_registry_allowed: false,
  display_and_allowlist_owner: "one-person-lab-app"
};

const appProfile = {
  client_renderer_compatibility: clientRendererCompatibility,
  delivery_topology: {
    minimum_complete_product: {
      composition_model: compositionModel
    }
  }
};

const hostState = {
  app_state: {
    ui_contributions: {
      surface_kind: "opl_app_ui_contributions_projection.v1",
      entries: [{
        contribution_key: "mas:roadmap",
        contribution_id: "roadmap",
        package_id: "mas",
        slot: "runtime.detail",
        contribution_kind: "view",
        trust_tier: "declarative",
        scope: "work_item",
        sort_order: 20,
        action_boundary: "opl app action execute --json",
        view: {
          view_id: "roadmap",
          view_type: "task_board",
          title_i18n: { "en-US": " Roadmap " },
          data_ref: "mas.roadmap.v1#current"
        },
        commands: [{
          command_id: "refresh",
          label_i18n: { "en-US": " Refresh " },
          action_ref: "mas.roadmap.v1#refresh",
          confirmation_required: false
        }],
        badges: []
      }]
    },
    actions: [{ action_id: "package_contribution_execute" }]
  }
};

describe("OPL Studio Client Cordis conformance", () => {
  test("derives the Client policy only from the active App product profile", () => {
    expect(readOplClientCompositionPolicy(appProfile)).toEqual({
      abi: "opl_app_client_contributions.v1",
      projectionSchema: "opl_app_ui_contributions_projection.v1",
      slots: ["settings.section", "runtime.detail", "composer.palette"],
      stateRpc: "opl app state --profile fast --json",
      actionRpc: "opl app action execute --action <action_id> [--payload json] [--dry-run] --json",
      event: "opl/app-client-contributions/updated",
      stateSemanticsContract: "contracts/app-runtime-bridge.json",
      brandCapabilityProjectionPolicy: "dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client"
    });
    expect(() => readOplClientCompositionPolicy({
      ...compositionModel,
      framework_projection_runtime_status: "framework_host_projection_unavailable"
    })).toThrow("Invalid OPL Client Cordis policy");
    expect(() => readOplClientCompositionPolicy({
      ...appProfile,
      client_renderer_compatibility: {
        ...clientRendererCompatibility,
        typed_client_event: "renderer/event"
      }
    })).toThrow("Invalid OPL Client Cordis policy");
  });

  test("emits one typed projection event and exposes only App-declared slots", async () => {
    const composition = await createOplStudioClientCordisComposition(appProfile);
    const updates: unknown[] = [];
    const unsubscribe = composition.contributions.subscribe((projection) => updates.push(projection));

    expect(composition.ctx[OPL_CLIENT_CONTRIBUTIONS_SERVICE]).toBe(composition.contributions);
    expect(OPL_CLIENT_CONTRIBUTIONS_UPDATED_EVENT).toBe("opl/app-client-contributions/updated");
    expect(composition.contributions.detailsTabs).toBe(OPL_STUDIO_DETAIL_TABS);
    expect(composition.contributions.detailsTabs.map((tab) => tab.id)).toEqual([
      "opl-project-progress-panel",
      "opl-files-results-panel",
      "opl-agents-capabilities-panel"
    ]);
    expect(composition.contributions.readProjection()).toEqual({ surfaceKind: "unavailable", entries: [] });

    composition.contributions.updateHostState(hostState);
    composition.contributions.updateHostState(hostState);
    expect(updates).toHaveLength(1);
    expect(composition.contributions.readSlot("runtime.detail")).toMatchObject([{
      contributionKey: "mas:roadmap",
      packageId: "mas",
      actionBoundary: "opl app action execute --json",
      view: { title: { "en-US": "Roadmap" } },
      commands: [{ label: { "en-US": "Refresh" }, actionRef: "mas.roadmap.v1#refresh" }]
    }]);
    expect(composition.contributions.readSlot("settings.section")).toEqual([]);

    unsubscribe();
    await composition.dispose();
  });

  test("maps projected commands to the exact canonical App action payload", () => {
    const projection = readUiContributionsProjection(hostState);
    const entry = projection.entries[0]!;
    const command = entry.commands[0]!;

    expect(createOplContributionActionRequest(entry, command, false)).toEqual({
      actionId: "package_contribution_execute",
      payload: {
        package_id: "mas",
        ref: "mas.roadmap.v1#refresh",
        input: {},
        confirmed: false
      },
      dryRun: false
    });
    expect(createOplContributionActionRequest(entry, command, true).payload.confirmed).toBe(true);
  });
});
