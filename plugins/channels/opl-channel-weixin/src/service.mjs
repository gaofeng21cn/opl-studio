import { createHash } from "node:crypto";
import { WeixinInstalledChannelProvider } from "./provider.ts";
import { CHANNEL_CALLBACK_API_VERSION, CHANNEL_PROVIDER_ID } from "./types.ts";

const actionRoute = "opl.connect.channel-provider-host";
const commands = Object.freeze([
  ["weixin-connect", "connect", "Connect own Weixin", "连接本人微信"],
  ["weixin-connect-other", "connect-other", "Connect another person’s Weixin", "连接他人微信"],
  ["weixin-submit-pin", "submit-pin", "Verify and continue", "验证并继续"],
  ["weixin-disconnect", "disconnect", "Disconnect", "退出微信", true]
].map(([command_id, action, en, zh, confirmationRequired]) => Object.freeze({
  command_id,
  action_ref: `weixin.channel-access#${action}`,
  label_i18n: Object.freeze({ en, "zh-CN": zh }),
  confirmation_required: confirmationRequired === true
})));

const contribution = Object.freeze({
  contribution_key: `${CHANNEL_PROVIDER_ID}:weixin-channel-access`,
  contribution_id: "weixin-channel-access",
  package_id: CHANNEL_PROVIDER_ID,
  slot: "settings.section",
  contribution_kind: "view",
  trust_tier: "declarative",
  scope: "root",
  sort_order: 30,
  descriptor_schema_version: "opl-app-contributions.v1",
  view: Object.freeze({
    view_id: "weixin-channel-access",
    view_type: "channel_access",
    settings_destination: "resources",
    data_ref: "weixin.channel-access#state",
    title_i18n: Object.freeze({ en: "Weixin", "zh-CN": "微信" }),
    empty_state_i18n: Object.freeze({ en: "Weixin is unavailable", "zh-CN": "微信当前不可用" })
  }),
  commands,
  badges: Object.freeze([]),
  action_boundary: actionRoute
});

function contributionReadback(request, operation, result, confirmationRequired = false) {
  return {
    opl_app_contribution: {
      surface_kind: "opl_app_package_contribution.v1",
      package_id: CHANNEL_PROVIDER_ID,
      ref: request.ref,
      operation,
      confirmation_required: confirmationRequired,
      carrier_readback: {
        kind: "dsh_plugin",
        identity: "@gaofeng21cn/opl-channel-weixin",
        lifecycle_authority: "dsh_profile"
      },
      readiness: {
        installed: true,
        physical_status: "installed",
        callability: "callable"
      },
      response: {
        schema_version: "opl-package-app-contribution-response.v1",
        ok: true,
        ref: request.ref,
        operation,
        result
      }
    }
  };
}

const bindingAuthority = Object.freeze({
  raw_fact_owner: "current_shell_exact_binding_store",
  projection_owner: "opl-studio",
  thread_truth_owner: "canonical_codex_app_server",
  consumer_role: "render_and_join_only",
  persistence_role: "none"
});

const bindingProjection = Object.freeze({
  surface_kind: "opl_app_transport_bindings_projection.v1",
  authority_boundary: bindingAuthority
});

async function readTransportBindings(callback) {
  try {
    const rows = await callback.readTransportBindings();
    return {
      ...bindingProjection,
      status: "available",
      bindings: rows.filter(row => row.provider_id === CHANNEL_PROVIDER_ID).map(({
        provider_id, account_id, channel_session_id, canonical_thread_host, canonical_thread_id
      }) => ({
        binding_id: `binding-${createHash("sha256")
          .update(JSON.stringify([provider_id, account_id, channel_session_id])).digest("hex")}`,
        provider_id, account_id, channel_session_id, canonical_thread_host, canonical_thread_id,
        project_affinity: "projectless",
        status: "bound"
      })).sort((left, right) => left.binding_id.localeCompare(right.binding_id))
    };
  } catch {
    return { ...bindingProjection, status: "unavailable", bindings: [], unavailable_reason: "projection_unavailable" };
  }
}

export function createWeixinChannelService({ loginOptions } = {}) {
  let registration;
  let starting;
  let closed = false;
  return Object.freeze({
    async connect(callback) {
      if (closed || registration || starting) throw new Error("Weixin channel is already attached or closed.");
      for (const method of ["readTransportBindings", "startThread", "resumeThread", "startTurn", "subscribeTurn"]) {
        if (typeof callback?.[method] !== "function") throw new TypeError(`Weixin channel requires the Codex callback ${method}.`);
      }
      const provider = new WeixinInstalledChannelProvider(loginOptions);
      starting = (async () => {
        let transportBindings = await readTransportBindings(callback);
        if (closed) throw new Error("Weixin channel has been closed.");
        const lifecycle = await provider.start({
          callback_api_version: CHANNEL_CALLBACK_API_VERSION,
          callback: {
            async startThread(identity) {
              const thread = await callback.startThread(identity);
              transportBindings = await readTransportBindings(callback);
              const persisted = transportBindings.bindings.find(binding =>
                binding.account_id === identity.account_id && binding.channel_session_id === identity.channel_session_id
              );
              if (persisted?.canonical_thread_host !== thread.canonical_thread_host
                || persisted?.canonical_thread_id !== thread.canonical_thread_id) {
                throw new Error("Codex did not persist the exact Weixin thread binding.");
              }
              return thread;
            },
            resumeThread: request => callback.resumeThread(request),
            startTurn: request => callback.startTurn(request),
            subscribeTurn: (request, observer) => callback.subscribeTurn(request, observer)
          }
        });
        let disposing;
        function assertActive(request) {
          if (disposing || closed) throw new Error("Weixin channel has been closed.");
          if (request?.package_id !== CHANNEL_PROVIDER_ID) throw new TypeError("Request must address the Weixin channel.");
        }
        registration = Object.freeze({
          appStatePatch: () => {
            const active = !closed && !disposing;
            return {
              ui_contributions: {
                surface_kind: "opl_app_ui_contributions_projection.v1",
                contribution_count: active ? 1 : 0,
                entries: active ? [contribution] : []
              },
              transport_bindings: active
                ? transportBindings
                : { ...bindingProjection, status: "unavailable", bindings: [], unavailable_reason: "producer_absent" }
            };
          },
          async readChannelAccess(request) {
            assertActive(request);
            if (request.ref !== provider.channel_access.data_ref) throw new TypeError("Unknown Weixin channel data reference.");
            const result = await provider.channel_access.read(request.input ?? {});
            return contributionReadback(request, "read", result);
          },
          async executeChannelAccessAction(request) {
            assertActive(request);
            const command = commands.find(item => item.action_ref === request.ref);
            if (!command) throw new TypeError("Unknown Weixin channel action.");
            if (command.confirmation_required && request.confirmed !== true) {
              throw new Error("Disconnecting Weixin requires confirmation.");
            }
            const result = await provider.channel_access.execute({ action_ref: request.ref, input: request.input ?? {} });
            return contributionReadback(request, "execute", result, command.confirmation_required);
          },
          dispose() {
            disposing ??= Promise.resolve(lifecycle.dispose()).finally(() => { registration = undefined; });
            return disposing;
          }
        });
        return registration;
      })();
      try {
        return await starting;
      } finally {
        starting = undefined;
      }
    },
    async dispose() {
      closed = true;
      await starting?.catch(() => {});
      await registration?.dispose();
    }
  });
}
