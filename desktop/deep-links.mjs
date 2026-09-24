// App contracts provide the only route registry. This module is browser-safe so
// the main process and renderer can apply the same validation at both boundaries.
export const PROTOCOL_SCHEME = "opl";
export const MAX_DEEP_LINK_URL_LENGTH = 2048;
const MAX_PENDING_DEEP_LINKS = 16;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const rejected = reason => ({ valid: false, reason });
const exactPath = value => typeof value === "string" && /^\/[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(value);

export function createDeepLinkPolicy(guiContract, settingsControlPlane) {
  const source = guiContract?.branded_deep_link_policy;
  if (source?.schema !== "opl_app_branded_deep_link.v1" || source.scheme !== PROTOCOL_SCHEME
    || JSON.stringify(source.accepted_schemes) !== '["opl"]'
    || JSON.stringify(source.allowed_actions) !== '["navigate"]'
    || source.action_authority !== "url_hostname_only_with_empty_path"
    || source.route_registry?.match_policy !== "exact_path_only_no_query_hash_or_dynamic_segments") {
    throw new Error("Invalid App branded deep-link policy");
  }
  const groups = [source.route_registry.static_exact_routes,
    settingsControlPlane?.ordinary_routes?.map(route => route.path),
    settingsControlPlane?.secondary_pages?.map(route => route.path)];
  if (groups.some(group => !Array.isArray(group) || group.some(route => !exactPath(route)))) {
    throw new Error("Invalid App branded deep-link route registry");
  }
  if (!Array.isArray(source.forbidden_parameter_names) || !Array.isArray(source.secret_like_value_prefixes)) {
    throw new Error("Invalid App branded deep-link secret policy");
  }
  return Object.freeze({
    schema: "opl_studio_deep_link_policy.v1",
    source: "contracts/app-gui-product-contract.json#branded_deep_link_policy",
    settingsRouteSource: "contracts/app-settings-control-plane.json#ordinary_routes+secondary_pages",
    routes: Object.freeze([...new Set(groups.flat())]),
    forbiddenParameters: Object.freeze([...source.forbidden_parameter_names]),
    secretPrefixes: Object.freeze([...source.secret_like_value_prefixes])
  });
}

export function isAllowedDeepLinkRoute(route, policy) {
  return policy?.schema === "opl_studio_deep_link_policy.v1"
    && exactPath(route) && Array.isArray(policy.routes) && policy.routes.includes(route);
}

function sensitive(value, policy) {
  return Array.isArray(policy?.secretPrefixes)
    && policy.secretPrefixes.some(prefix => typeof prefix === "string"
      && value.toLowerCase().includes(prefix.toLowerCase()));
}

export function validateDeepLinkPayload(value, policy) {
  if (!record(value) || Object.keys(value).sort().join(",") !== "action,params" || value.action !== "navigate"
    || !record(value.params) || Object.keys(value.params).join(",") !== "route"
    || typeof value.params.route !== "string") return rejected("invalid_payload");
  if (sensitive(value.params.route, policy)) return rejected("sensitive_data");
  if (!isAllowedDeepLinkRoute(value.params.route, policy)) return rejected("route_not_allowed");
  return { valid: true, payload: { action: "navigate", params: { route: value.params.route } } };
}

export function parseDeepLinkUrl(raw, policy) {
  if (typeof raw !== "string") return rejected("invalid_url");
  if (raw.length > MAX_DEEP_LINK_URL_LENGTH) return rejected("url_too_long");
  // URL() silently trims whitespace and normalizes controls; reject those inputs
  // before parsing rather than accepting a different effective link.
  if (/[\u0000-\u0020\u007f]/.test(raw)) return rejected("invalid_url");
  let url;
  try { url = new URL(raw); } catch { return rejected("invalid_url"); }
  if (url.protocol !== `${PROTOCOL_SCHEME}:`) return rejected("invalid_scheme");
  if (url.username || url.password || url.port) return rejected("forbidden_authority");
  if (url.hash || raw.includes("#")) return rejected("fragment_not_allowed");
  if (url.hostname !== "navigate" || url.pathname !== "") return rejected("unknown_action");
  const entries = [...url.searchParams];
  for (const [key, value] of entries) {
    if (policy?.forbiddenParameters?.includes(key.toLowerCase()) || sensitive(value, policy)) {
      return rejected("sensitive_data");
    }
    if (key !== "route") return rejected("unknown_parameter");
  }
  if (!entries.length || entries[0][1] === "") return rejected("missing_route");
  if (entries.length !== 1) return rejected("duplicate_parameter");
  return validateDeepLinkPayload({ action: "navigate", params: { route: entries[0][1] } }, policy);
}

export function extractDeepLinkPayloadFromArgv(argv, policy, onReject = () => {}) {
  if (!Array.isArray(argv)) return null;
  for (const argument of argv) {
    if (typeof argument !== "string" || !/^opl:/i.test(argument)) continue;
    const result = parseDeepLinkUrl(argument, policy);
    if (result.valid) return result.payload;
    onReject(result.reason);
  }
  return null;
}

export function extractSecondInstanceDeepLinkPayload(argv, additionalData, policy, onReject = () => {}) {
  if (record(additionalData) && Object.hasOwn(additionalData, "deepLinkPayload")) {
    const result = validateDeepLinkPayload(additionalData.deepLinkPayload, policy);
    if (result.valid) return result.payload;
    onReject(result.reason);
  }
  return extractDeepLinkPayloadFromArgv(argv, policy, onReject);
}

export function createDeepLinkDelivery({ policy, emit, onReject = () => {} }) {
  const pending = [];
  let consumerReady = false;
  const acceptPayload = value => {
    const result = validateDeepLinkPayload(value, policy);
    if (!result.valid) { onReject(result.reason); return result; }
    if (consumerReady) emit(result.payload);
    else {
      pending.push(result.payload);
      if (pending.length > MAX_PENDING_DEEP_LINKS) pending.shift();
    }
    return result;
  };
  return {
    acceptPayload,
    acceptUrl(raw) {
      const result = parseDeepLinkUrl(raw, policy);
      if (!result.valid) { onReject(result.reason); return result; }
      return acceptPayload(result.payload);
    },
    acceptArgv(argv) {
      const payload = extractDeepLinkPayloadFromArgv(argv, policy, onReject);
      return payload ? acceptPayload(payload) : null;
    },
    acceptSecondInstance(argv, additionalData) {
      const payload = extractSecondInstanceDeepLinkPayload(argv, additionalData, policy, onReject);
      return payload ? acceptPayload(payload) : null;
    },
    // Called only after renderer subscription is installed, never did-finish-load.
    takePending() { consumerReady = true; return pending.splice(0); },
    deactivate() { consumerReady = false; },
    pendingCount() { return pending.length; }
  };
}
