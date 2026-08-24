import assert from "node:assert/strict";
import test from "node:test";

import {
  selectProjectProgress,
  type ProjectProgressItemProjection
} from "../../src/workbench/projectProgress.ts";
import type { WorkItemRuntimeProjection } from "../../src/workbench/workbenchModel.ts";

const baseItem = (overrides: Partial<ProjectProgressItemProjection> = {}): ProjectProgressItemProjection => ({
  id: "item-1",
  agentId: "agent-1",
  agentDisplayName: "Agent fallback",
  projectId: "project-1",
  projectDisplayName: "Project fallback",
  workItemId: "work-1",
  title: "Work item one",
  status: "running",
  statusLabel: "Running",
  executionState: "running",
  activeSessionCount: 1,
  attentionKind: "none",
  elapsedMs: null,
  stageTokens: null,
  totalTokens: null,
  telemetryState: "observed",
  archived: false,
  stages: [],
  ...overrides
});

const projection = (items: ProjectProgressItemProjection[], projectOverrides: Record<string, unknown> = {}) => ({
  schemaVersion: "work-item-projection.v2",
  summary: {
    agentCount: 1,
    projectCount: 1,
    workItemCount: items.length,
    archivedWorkItemCount: 0,
    runningCount: 1,
    activeSessionCount: 1,
    userAttentionCount: 0,
    systemAttentionCount: 0,
    telemetryObservedCount: items.length,
    telemetryMissingCount: 0
  },
  agents: [{ id: "agent-1", label: "Agent One" }],
  projects: [{ id: "project-1", agentId: "agent-1", label: "Project One", ...projectOverrides }],
  items
}) as unknown as WorkItemRuntimeProjection;

test("matches a project workspace and projects a UI-ready item", () => {
  const result = selectProjectProgress("/work/project-one", projection([
    baseItem({
      currentStageId: "analysis",
      currentStageName: "Analysis fallback",
      attemptId: "attempt-7",
      attentionKind: "user",
      statusReason: "Needs a decision",
      nextActionTitle: "Review the result",
      nextActionOwner: "You",
      stages: [
        {
          stageId: "intake",
          displayName: "Intake",
          displayNameI18n: { zh: "接收", en: "Intake" },
          state: "completed",
          elapsedSeconds: 1,
          totalTokens: 2
        },
        {
          stageId: "analysis",
          displayName: "Analysis",
          displayNameI18n: { zh: "分析", en: "Analysis" },
          state: "running",
          elapsedSeconds: 3,
          totalTokens: 4
        },
        {
          stageId: "delivery",
          displayName: "Delivery",
          displayNameI18n: { zh: "交付", en: "Delivery" },
          state: "pending",
          elapsedSeconds: null,
          totalTokens: null
        }
      ]
    })
  ], { workspacePath: "/work/project-one" }), "zh");

  assert.deepEqual(result.matchedProject, { id: "project-1", label: "Project One" });
  assert.deepEqual(result.items[0], {
    id: "item-1",
    agentLabel: "Agent One",
    projectLabel: "Project One",
    workItemLabel: "Work item one",
    lifecycleStatus: "running",
    lifecycleStatusLabel: "Running",
    lifecycleStatusReason: "Needs a decision",
    completedStages: 1,
    totalStages: 3,
    currentStage: { id: "analysis", label: "分析" },
    attempt: { id: "attempt-7" },
    attention: "user",
    blocker: "Needs a decision",
    nextAction: { title: "Review the result", owner: "You" }
  });
});

test("normalizes trailing slashes but does not guess a different workspace", () => {
  const matched = selectProjectProgress("/work/project-one/", projection([
    baseItem({ workspacePath: "/work/project-one" })
  ], { workspacePath: "/work/project-one" }), "en");
  assert.equal(matched.matchedProject?.id, "project-1");

  const result = selectProjectProgress("/work/other-project", projection([
    baseItem({ workspacePath: "/work/project-one" })
  ], { workspacePath: "/work/project-one" }), "en");

  assert.equal(result.matchedProject, null);
  assert.equal(result.emptyReason, "no_matching_project");
});

test("returns an explicit reason for an unavailable projection or missing match", () => {
  assert.deepEqual(selectProjectProgress("/work/project-one", undefined, "en"), {
    matchedProject: null,
    items: [],
    emptyReason: "projection_unavailable"
  });
  assert.deepEqual(selectProjectProgress("/work/missing", projection([]), "zh"), {
    matchedProject: null,
    items: [],
    emptyReason: "no_matching_project"
  });
});

test("does not infer current stage from the first pending stage", () => {
  const result = selectProjectProgress("/work/project-one", projection([
    baseItem({
      stages: [{
        stageId: "first",
        displayName: "First",
        displayNameI18n: { zh: "第一阶段", en: "First" },
        state: "pending",
        elapsedSeconds: null,
        totalTokens: null
      }]
    })
  ], { workspacePath: "/work/project-one" }), "en");

  assert.equal(result.items[0]?.currentStage, undefined);
  assert.equal(result.items[0]?.completedStages, 0);
  assert.equal(result.items[0]?.totalStages, 1);
});

test("does not expose an attempt without the explicit current attempt id", () => {
  const result = selectProjectProgress("/work/project-one", projection([
    baseItem()
  ], { workspacePath: "/work/project-one" }), "en");

  assert.equal(result.items[0]?.attempt, undefined);
});

test("matches item workspaces and retains multiple work items in the project", () => {
  const result = selectProjectProgress("/work/project-one", projection([
    baseItem({ id: "item-1", workItemId: "work-1", workspacePath: "/work/project-one" }),
    baseItem({ id: "item-2", workItemId: "work-2", title: "Work item two", workspacePath: "/work/project-one" }),
    baseItem({ id: "item-3", workItemId: "work-3", title: "Other workspace", workspacePath: "/work/other" })
  ]), "en");

  assert.equal(result.matchedProject?.id, "project-1");
  assert.deepEqual(result.items.map((item) => item.id), ["item-1", "item-2"]);
  assert.deepEqual(result.items.map((item) => item.workItemLabel), ["Work item one", "Work item two"]);
});
