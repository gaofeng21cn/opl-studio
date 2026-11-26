import type { CodexApiKeyConfigurationErrorCode, GatewayAccountLoginErrorCode } from "../../bridge/oplBridge";

// The settings page renders feedback for two credential paths - Gateway account
// login and Codex API-key configuration - and each has its own error union.
export type GatewayAccountMessageCode = GatewayAccountLoginErrorCode | CodexApiKeyConfigurationErrorCode;

// The Gateway login flow used to render the raw machine code (e.g.
// "invalid_credentials", "gateway_account_failed") straight into the settings
// feedback area, so users saw enum values instead of an instruction. Every
// canonical code now resolves to a localized, actionable sentence; the raw code
// is never shown.
const GATEWAY_ACCOUNT_ERROR_MESSAGES: Record<GatewayAccountMessageCode, { zh: string; en: string }> = {
  invalid_credentials: {
    zh: "邮箱或密码不正确。请确认使用的是 OPL Gateway 账号，然后重试。",
    en: "The email or password is incorrect. Confirm this is an OPL Gateway account and try again."
  },
  account_disabled: {
    zh: "该账号已被停用。请联系 OPL Gateway 管理员。",
    en: "This account is disabled. Contact an OPL Gateway administrator."
  },
  mfa_or_challenge_required: {
    zh: "OPL Gateway 要求额外的交互式验证。请在浏览器中完成验证后再登录。",
    en: "OPL Gateway requires an interactive verification challenge. Complete it in a browser, then sign in again."
  },
  session_not_persistable: {
    zh: "OPL Gateway 没有返回可长期保存的会话。请稍后重试或联系支持。",
    en: "OPL Gateway did not return a persistent session. Try again later or contact support."
  },
  group_selection_required: {
    zh: "该账号有多个可用分组，需要先选择一个分组才能完成本机设置。",
    en: "This account has several available groups; select one to finish device setup."
  },
  auth_expired: {
    zh: "登录状态已过期。请重新登录。",
    en: "Your session has expired. Sign in again."
  },
  network_unreachable: {
    zh: "无法连接 OPL Gateway。请检查网络或代理后重试。",
    en: "OPL Gateway could not be reached. Check your network or proxy and try again."
  },
  rate_limited: {
    zh: "请求过于频繁，已被限流。请稍后重试。",
    en: "Too many requests. Wait a moment and try again."
  },
  managed_key_missing: {
    zh: "登录成功，但 OPL Gateway 没有返回本机密钥。请在账户页执行“修复”后重试。",
    en: "Signed in, but OPL Gateway did not return a device key. Run Repair on the account page and try again."
  },
  managed_key_conflict: {
    zh: "检测到多份本机密钥。请在账户页执行“修复”以合并后再重试。",
    en: "More than one device key was found. Run Repair on the account page, then try again."
  },
  managed_key_identity_drift: {
    zh: "本机密钥在 OPL Gateway 中被重命名。请在账户页执行“修复”后重试。",
    en: "The device key was renamed in OPL Gateway. Run Repair on the account page and try again."
  },
  disconnect_pending: {
    zh: "旧的密钥还没能停用，账号尚未断开。请稍后重试断开操作。",
    en: "The previous key could not be disabled, so the account is not disconnected yet. Retry the disconnect."
  },
  account_switch_requires_disconnect: {
    zh: "本机已连接另一个 OPL Gateway 账号。请先断开当前账号，再登录新账号。",
    en: "A different OPL Gateway account is already connected on this device. Disconnect it before signing in to another account."
  },
  gateway_busy: {
    zh: "另一个 OPL Gateway 账号操作仍在进行。请稍候再试。",
    en: "Another OPL Gateway account operation is still running. Wait for it to finish and try again."
  },
  gateway_codex_binding_failed: {
    zh: "本机密钥无法安全绑定到 Codex，设置未完成。请重试，或先用“修复”清理后重试。",
    en: "The device key could not be bound to Codex safely, so setup did not finish. Retry, or run Repair first."
  },
  gateway_configuration_invalid: {
    zh: "App 的 OPL Gateway 地址配置无效。请联系支持。",
    en: "The App's OPL Gateway endpoint configuration is invalid. Contact support."
  },
  gateway_request_rejected: {
    zh: "OPL Gateway 拒绝了这次请求。请稍后重试；若持续出现请联系支持。",
    en: "OPL Gateway rejected the request. Try again; contact support if it keeps happening."
  },
  gateway_response_invalid: {
    zh: "OPL Gateway 返回了无法识别的响应。请稍后重试。",
    en: "OPL Gateway returned an unusable response. Try again later."
  },
  gateway_store_invalid: {
    zh: "本机保存的 OPL Gateway 凭据无法读取。请检查权限后重试，或联系支持。",
    en: "The locally stored OPL Gateway credentials could not be read. Check permissions and retry, or contact support."
  },
  credentials_stdin_too_large: {
    zh: "登录信息过大，无法提交。请确认邮箱和密码填写正确。",
    en: "The sign-in payload was too large to submit. Check the email and password fields."
  },
  invalid_request: {
    zh: "请求无效。请确认填写内容正确后重试。",
    en: "The request was invalid. Check the fields you entered and try again."
  },
  internal_contract_violation: {
    zh: "操作被安全策略中止。请重试，若持续出现请联系支持。",
    en: "A safety check stopped the operation. Retry, or contact support if it keeps happening."
  },
  codex_configuration_failed: {
    zh: "Codex 配置失败，密钥没有保存。请重试。",
    en: "Codex configuration failed and the key was not stored. Try again."
  },
  gateway_account_failed: {
    zh: "登录失败，且 OPL Gateway 没有给出可识别的原因。请重试，并附上诊断日志联系支持。",
    en: "Sign-in failed and OPL Gateway did not report a recognizable reason. Retry, then contact support with diagnostics."
  }
};

export function gatewayAccountErrorMessage(
  errorCode: GatewayAccountMessageCode | null | undefined,
  locale: string
): string {
  const zh = locale.toLowerCase().startsWith("zh");
  const entry = errorCode ? GATEWAY_ACCOUNT_ERROR_MESSAGES[errorCode] : undefined;
  if (entry) return zh ? entry.zh : entry.en;
  return zh ? "登录失败。" : "Login failed.";
}
