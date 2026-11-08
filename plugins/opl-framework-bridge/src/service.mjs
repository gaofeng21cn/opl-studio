import { createWorkbenchTaskExecutor } from "../../../src/host/workbench-task-executor.mjs";
import { loadFrameworkCordisProfiles, createFrameworkChannelCallbackRegistrar } from "../../../src/host/framework-channel-bootstrap.mjs";
import { createCodexApiKeyConfiguration, createGatewayAccountLogin } from "../../../src/host/gateway-account-login.mjs";
import { createConnectionAccessApproval } from "../../../src/host/connection-access-approval.mjs";
import { createOplPassthrough } from "../../../src/host/opl-passthrough.mjs";

export class OplFrameworkBridge {
  constructor({
    workspaceRoot,
    opl,
    candidateActionAllowlist = [],
    channelCallbackRegistrar,
    gatewayAccountLogin,
    codexApiKeyConfiguration,
    connectionAccessApproval,
    codex,
    env = process.env
  } = {}) {
    const oplCommand = env.OPL_APP_OPL_BIN ?? env.OPL_COMMAND ?? "opl";
    this.codex = codex;
    this.workbenchBootstrap = async () => {
      const profiles = await loadFrameworkCordisProfiles({ command: oplCommand, env });
      if (!profiles.startCordisWorkbenchServicesHost) throw Error('Framework workbench services export is unavailable; update Framework.');
      return profiles.startCordisWorkbenchServicesHost({ executor: createWorkbenchTaskExecutor(codex.transport), env });
    };
    this.opl = opl ?? createOplPassthrough({
      cwd: workspaceRoot,
      command: oplCommand,
      env,
      candidateActionAllowlist,
      channelCallbackRegistrar: channelCallbackRegistrar
        ?? createFrameworkChannelCallbackRegistrar({ command: oplCommand, env })
    });
    this.gatewayAccountLogin = gatewayAccountLogin ?? createGatewayAccountLogin({
      command: oplCommand,
      cwd: workspaceRoot,
      env
    });
    this.codexApiKeyConfiguration = codexApiKeyConfiguration ?? createCodexApiKeyConfiguration({
      command: oplCommand,
      cwd: workspaceRoot,
      env
    });
    this.connectionAccessApproval = connectionAccessApproval ?? createConnectionAccessApproval({
      command: oplCommand,
      cwd: workspaceRoot,
      env
    });
    this.channelCallbackRegistration = { status: "dormant", registered: false, dispose: async () => {} };
    this.channelCallbackRegistrationAttempted = false;
    this.closePromise = null;
  }

  async start() {
    if (!this.workbenchRegistration && this.opl.registerWorkbenchServices) {
      this.workbenchRegistration = this.opl.registerWorkbenchServices(this.workbenchBootstrap);
      await this.workbenchRegistration;
    }
    if (
      this.codex?.transport?.initialized === true
      && !this.channelCallbackRegistrationAttempted
      && this.codex.channelCallbackAdapter
      && typeof this.opl.registerChannelCallbackAdapter === "function"
    ) {
      this.channelCallbackRegistrationAttempted = true;
      try {
        this.channelCallbackRegistration = await this.opl.registerChannelCallbackAdapter(
          this.codex.channelCallbackAdapter
        );
      } catch (error) {
        this.channelCallbackRegistration = {
          status: "failed",
          registered: false,
          reasonCode: error.code ?? "channel_provider_bootstrap_failed",
          dispose: async () => {}
        };
      }
    }
    return this.capabilities();
  }

  capabilities() {
    return {
      available: true,
      authorityBoundary: "app_bridge_no_domain_authority",
      channelCallback: {
        schema: this.codex?.capabilities().channelCallbackSchema ?? null,
        status: this.channelCallbackRegistration?.status ?? "dormant",
        registered: this.channelCallbackRegistration?.registered === true,
        ...(this.channelCallbackRegistration?.reasonCode
          ? { reasonCode: this.channelCallbackRegistration.reasonCode }
          : {})
      }
    };
  }

  async close() {
    this.closePromise ??= Promise.allSettled([this.channelCallbackRegistration?.dispose?.(), this.opl.closeWorkbenchServices?.()]);
    return this.closePromise;
  }
}
