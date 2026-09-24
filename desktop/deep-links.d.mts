export type DeepLinkPolicy = { schema: "opl_studio_deep_link_policy.v1"; routes: readonly string[]; forbiddenParameters: readonly string[]; secretPrefixes: readonly string[] };
export type DeepLinkPayload = { action: "navigate"; params: { route: string } };
export type DeepLinkResult = { valid: true; payload: DeepLinkPayload } | { valid: false; reason: string };
export function validateDeepLinkPayload(value: unknown, policy: unknown): DeepLinkResult;
export function isAllowedDeepLinkRoute(route: unknown, policy: unknown): boolean;
export function parseDeepLinkUrl(raw: unknown, policy: unknown): DeepLinkResult;
export function createDeepLinkPolicy(gui: unknown, settings: unknown): DeepLinkPolicy;
