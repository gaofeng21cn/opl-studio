import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AccountSettingsPage } from "../../plugins/opl-studio-client/src/client/workbench/settings/pages/AccountSettingsPage";
import type { GatewayActionViewModel } from "../../plugins/opl-studio-client/src/client/workbench/settingsActions";

// The App contract fixes where this control lives and what it must be reachable for:
//   contracts/app-page-state-matrix.json#pages[19].opl_gateway_account
//   "disconnect_placement": "identity_row_trailing_adjacent_to_display_name_email_and_connection_status"
//   "disconnect_detached_footer_or_page_edge_allowed": false
//   "default_path_policy": "preserve_current_access_path_and_offer_explicit_switch"
// The credential-entry state is the one place a switched account is unusable
// without it: signing in to another account is refused with
// account_switch_requires_disconnect, so the disconnect control has to be
// reachable while that form is open instead of only outside it.
const disconnect: GatewayActionViewModel = {
  key: "gateway:disconnect",
  actionId: "gateway_account_disconnect",
  label: "Disconnect",
  payload: {},
  confirmationRequired: true,
  transport: "app_action",
  availability: "ready",
  requiredPayloadFields: [],
  dryRunSupported: false,
  semantic: "disconnect",
  kind: "disconnect",
  sourceRef: "app_state.settings_control_center.app_settings_read_model.opl_gateway_account"
};

const gateway = {
  displayName: "OPL User",
  email: "user@example.com",
  status: "connected",
  accountStatus: "active",
  balance: { amount: 12.5, currency: "USD" },
  usage: { todayTokens: 1000, todayCost: 0.5, currency: "USD" }
};

function render({ editingAccess, gatewayAccountReady = true, connected = true }: { editingAccess: boolean; gatewayAccountReady?: boolean; connected?: boolean }) {
  const props = {
    gatewayAction: (kind: string) => (kind === "disconnect" ? disconnect : undefined),
    actionViewModel: { gatewayActions: [] },
    onGatewayLogin: async () => true,
    gatewayConnectionState: connected ? "account" : "none",
    gatewayAccountReady,
    editingAccess,
    accessSetupMode: "account",
    setupCapabilities: { modelAccessSecretInput: true, codexInstall: true },
    settings: { locale: "zh" },
    projection: { codex: { installed: true } },
    actionBusyKey: null,
    onInstallCodex: async () => undefined,
    setAccessSetupMode: () => undefined,
    setGatewayPassword: () => undefined,
    setCodexApiKey: () => undefined,
    setEditingAccess: () => undefined,
    gatewayEmail: "",
    gatewayPassword: "",
    setGatewayEmail: () => undefined,
    codexApiKey: "",
    onConfigureCodexApiKey: async () => true,
    gateway: connected ? gateway : null,
    zh: true,
    locale: "zh",
    modelAccessState: null,
    onAction: () => undefined,
    gatewayUnavailableLabel: "",
    gatewayUnavailableDetail: ""
  } as never;
  return renderToStaticMarkup(createElement(AccountSettingsPage, props));
}

test("the disconnect control stays on the account identity row and never detaches to the page edge", () => {
  const html = render({ editingAccess: false });

  expect(html).toContain('data-testid="settings-gateway-account"');
  expect(html).toContain('data-testid="opl-settings-gateway-username"');
  expect(html).toContain("断开连接");
  // The control belongs inside the identity row, next to name / email / status.
  const identityRow = html.slice(html.indexOf('data-testid="settings-gateway-account"'));
  const rowEnd = identityRow.indexOf("</div>");
  expect(identityRow.slice(0, rowEnd)).toContain("断开连接");
  expect(html).not.toContain("账户管理");
});

test("the disconnect control is reachable while the credential form is open", () => {
  // Reproduces the dead end: account A is connected, the user opens the login
  // form to switch to account B, the Gateway refuses with
  // account_switch_requires_disconnect, and the disconnect control used to be
  // hidden by the same condition that shows the form.
  const html = render({ editingAccess: true });

  expect(html).toContain("断开连接");
  expect(html).toContain('data-testid="settings-gateway-account"');
  expect(html).toContain('data-testid="opl-settings-gateway-login"');
});

test("no disconnect control is offered while no account is connected", () => {
  const html = render({ editingAccess: true, connected: false, gatewayAccountReady: false });

  expect(html).not.toContain("断开连接");
  expect(html).not.toContain('data-testid="settings-gateway-account"');
});
