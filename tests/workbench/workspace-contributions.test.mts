import { expect, test } from "bun:test";
import { declaredItemActions, itemSummary, itemTitle, parseWorkspaceInput, readWorkspaceCollection, workspaceEntries, workspaceGroups, workspaceReadInput } from "../../src/composition/workspaceViewModel";
import type { OplUiContribution } from "../../src/composition/contributionProjection";
import { contributionActionOutcome } from "../../src/composition/contributionProjection";

const entry: OplUiContribution = {
  contributionKey: "any-package:items", contributionId: "items", packageId: "any-package",
  slot: "settings.section", contributionKind: "view", trustTier: "declarative", scope: "root", sortOrder: 1,
  view: { viewId: "items", viewType: "approval_diff", title: {"en-US": "Review"}, dataRef: "some.capability.v1#items" },
  commands: [{commandId: "review", label: {"en-US": "Review"}, actionRef: "some.capability.v1#review", confirmationRequired: true}], badges: []
};

test("workspace consumes only admitted root collection views without recognizing package brands", () => {
  expect(workspaceEntries([entry, {...entry, slot: "runtime.detail"}, {...entry, scope: "work_item"}, {...entry, view: {...entry.view!, viewType: "service_status"}}])).toEqual([entry]);
});

test("unavailable owner state cannot become a ready empty inbox", () => {
  expect(readWorkspaceCollection({kind: "data", state: "input_required", reason: "binding missing", data: null})).toMatchObject({items: [], commandInputs: {}, state: "input_required", reason: "binding missing"});
  expect(readWorkspaceCollection({unexpected: true})).toBeNull();
});

test("collection commands remain independent of row actions sharing the same ref", () => {
  const action = {action_ref: entry.commands[0].actionRef, input: {}, label_i18n: {"zh-CN": "新建"}};
  const collection = readWorkspaceCollection({state: "ready", data: {items: [{id: "existing", actions: [action]}], collection_actions: [action], pagination: {offset: 20, limit: 20, total: 51, has_more: true}}})!;
  expect(declaredItemActions({actions: collection.collectionActions}, entry.commands)).toHaveLength(1);
  expect(collection.pagination).toEqual({offset: 20, limit: 20, total: 51, hasMore: true});
});

test("parameterized reads retain owner field choices and numeric boundaries", () => {
  const collection = readWorkspaceCollection({state: "input_required", input_schema: {policy_refs: {type: "string[]", required: true, options: [{value: "policy://mail", label_i18n: {"zh-CN": "邮箱规则"}}]}, offset: {type: "integer", required: false, minimum: 0}}, data: {items: []}})!;
  expect(collection.readInput.fields.policy_refs.type).toBe("string_list");
  expect(collection.readInput.fields.policy_refs.options?.[0].value).toBe("policy://mail");
  expect(() => parseWorkspaceInput(collection.readInput.fields, {policy_refs: "policy://mail", offset: "-1"})).toThrow("out of range");
});

test("clearing optional search omits empty input while retaining owner defaults and required values", () => {
  const collection = readWorkspaceCollection({state: "ready", input_schema: {query: {type: "string", required: false}, source_ref: {type: "string", required: true}, status: {type: "string", required: false, default: "pending"}}, data: {items: []}})!;
  expect(collection.readInput.defaults.status).toBe("pending");
  expect(workspaceReadInput(collection.readInput, {query: "", source_ref: "", offset: 0, status: undefined})).toEqual({source_ref: ""});
});

test("navigation groups by declared capability namespace rather than package identity", () => {
  const mail = {...entry, packageId: "unknown-provider", view: {...entry.view!, dataRef: "communications.mail.v1#recent"}};
  expect(workspaceGroups([mail])[0]).toEqual({key: "communications", entries: [mail]});
});

test("transport execution alone never closes a form with stale or nonterminal owner result", () => {
  const envelope = {surface_kind: "opl_app_package_contribution.v1", package_id: entry.packageId, ref: entry.commands[0].actionRef, operation: "execute",
    response: {schema_version: "opl-package-app-contribution-response.v1", ref: entry.commands[0].actionRef, operation: "execute", ok: true, result: {status: "approved"}}};
  expect(contributionActionOutcome({opl_app_contribution: envelope}, entry, entry.commands[0]).status).toBe("succeeded");
  expect(contributionActionOutcome({opl_app_contribution: {...envelope, package_id: "stale"}}, entry, entry.commands[0])).toEqual({status: "failed", retryable: false});
  expect(contributionActionOutcome({opl_app_contribution: {...envelope, response: {...envelope.response, result: {execution_status: "queued"}}}}, entry, entry.commands[0])).toEqual({status: "pending", retryable: false});
  expect(contributionActionOutcome({status: "executed"}, entry, entry.commands[0]).status).toBe("failed");
});

test("item actions cannot escape the descriptor command allowlist", () => {
  const digest = "sha256:reviewed";
  const actions = declaredItemActions({actions: [
    {action_ref: "some.capability.v1#review", input: {expected_digest: digest}},
    {action_ref: "communications.mail.v1#draft.send", input: {draft_id: "forged"}},
    {action_ref: "some.capability.v1#review", input: "invalid"}
  ]}, entry.commands);
  expect(actions).toEqual([{command: entry.commands[0], input: {expected_digest: digest}}]);
});

test("input projection parses structured fields and rejects malformed or missing review inputs", () => {
  const fields = {expected_digest: {type: "string" as const, required: true}, decision: {type: "string" as const, required: true, enum: ["approve", "reject"]}, source_refs: {type: "string_list" as const, required: true}, settings: {type: "object" as const, required: false}, enabled: {type: "boolean" as const, required: true}};
  expect(parseWorkspaceInput(fields, {expected_digest: "sha256:reviewed", decision: "approve", source_refs: "source:a\nsource:b", settings: '{"mode":"mail"}', enabled: false})).toEqual({expected_digest: "sha256:reviewed", decision: "approve", source_refs: ["source:a", "source:b"], settings: {mode: "mail"}, enabled: false});
  expect(() => parseWorkspaceInput(fields, {decision: "approve"})).toThrow("expected_digest");
  expect(() => parseWorkspaceInput({decision: fields.decision}, {decision: "send"})).toThrow("invalid option");
  expect(() => parseWorkspaceInput({settings: fields.settings}, {settings: "[]"})).toThrow("expected object");
});

test("read models expose forms without admitting unsupported field types", () => {
  const collection = readWorkspaceCollection({kind: "data", state: "ready", data: {items: [{id: "p1", title: "Note"}], command_inputs: {"some.capability.v1#review": {input_schema: {proposal_id: {type: "string", required: true}, unsafe: {type: "code", required: true}}, defaults: {proposal_id: "p1"}}}}});
  expect(collection?.commandInputs["some.capability.v1#review"].fields).toEqual({proposal_id: {type: "string", required: true}});
  expect(collection?.items[0].id).toBe("p1");
});

test("localized row labels and empty optional collections remain usable", () => {
  expect(itemTitle({title: "Research", label_i18n: {"zh-CN": "科研", "en-US": "Research"}}, 0, "zh")).toBe("科研");
  expect(itemSummary({summary: "Research context", summary_i18n: {"zh-CN": "科研论证与证据"}}, "zh")).toBe("科研论证与证据");
  expect(parseWorkspaceInput({links: {type: "string_list", required: true}}, {links: ""})).toEqual({links: []});
  const actions = declaredItemActions({actions: [{action_ref: "some.capability.v1#review", input: {status: "approved"}, label_i18n: {"zh-CN": "确认记忆"}}]}, entry.commands);
  expect(actions[0].label).toEqual({"zh-CN": "确认记忆"});
});
