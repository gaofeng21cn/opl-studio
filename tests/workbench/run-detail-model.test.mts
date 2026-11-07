import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRunDetailViewModel
} from "../../src/workbench/runDetailModel.ts";
import type { ArtifactPreview, WorkbenchArtifactRef } from "../../src/workbench/workbenchModel.ts";

const inputFile: WorkbenchArtifactRef = {
  id: "input-a",
  title: "Input A",
  kind: "file",
  status: "ready",
  previewKind: "markdown",
  ref: "attachment://input-a",
  summary: "Input for this thread",
  provenance: [],
  actions: []
};

const result: ArtifactPreview = {
  id: "result-a",
  label: "Result A",
  previewKind: "markdown",
  rendererModuleId: "markdown",
  title: "Result A",
  ref: "artifact://result-a",
  summary: "Result for this work item"
};

test("run detail keeps files, results, active lines, and modules inside the selected identity", () => {
  const viewModel = buildRunDetailViewModel({
    thread: { id: "thread-a", status: "active", agentRole: "researcher" },
    workItemId: "work-a",
    running: true,
    activeLines: [{
      status: "running",
      activeRunId: "work-a",
      nextVisibleStep: "Validate hypothesis",
      progressDeltaClassification: "analysis",
      deliverableProgressDelta: "draft updated",
      platformRepairDelta: "none",
      nextForcedDelta: "review"
    }, {
      status: "running",
      activeRunId: "work-b",
      nextVisibleStep: "Other work",
      progressDeltaClassification: "analysis",
      deliverableProgressDelta: "none",
      platformRepairDelta: "none",
      nextForcedDelta: "review"
    }],
    files: [
      { scope: "thread", threadId: "thread-a", value: inputFile },
      { scope: "thread", threadId: "thread-b", value: { ...inputFile, id: "other-input" } }
    ],
    results: [
      { scope: "work_item", threadId: "thread-a", workItemId: "work-a", value: result },
      { scope: "work_item", threadId: "thread-a", workItemId: "work-b", value: { ...result, id: "other-result" } }
    ],
    contributions: {
      surfaceKind: "opl_app_ui_contributions_projection.v1",
      entries: [{
        contributionKey: "mas:roadmap",
        contributionId: "roadmap",
        packageId: "mas",
        slot: "runtime.detail",
        contributionKind: "view",
        trustTier: "declarative",
        scope: "work_item",
        sortOrder: 10,
        view: { viewId: "roadmap", viewType: "task_board", title: { en: "Roadmap" }, dataRef: "mas.roadmap#current" },
        commands: [],
        badges: []
      }, {
        contributionKey: "future:unknown",
        contributionId: "unknown",
        packageId: "future",
        slot: "runtime.detail",
        contributionKind: "future_kind",
        trustTier: "declarative",
        scope: "root",
        sortOrder: 20,
        commands: [],
        badges: []
      }]
    }
  });

  assert.equal(viewModel.status.state, "running");
  assert.equal(viewModel.status.agentLabel, "researcher");
  assert.deepEqual(viewModel.status.activeLines.map((line) => line.activeRunId), ["work-a"]);
  assert.deepEqual(viewModel.files.map((file) => file.id), ["input-a"]);
  assert.deepEqual(viewModel.results.map((item) => item.id), ["result-a"]);
  assert.deepEqual(viewModel.runtimeDetails.map((item) => item.state), ["ready", "unsupported"]);
  assert.equal(viewModel.runtimeDetails[1]?.fallbackReason, "unknown_contribution_kind");
});
test("work-item modules and results stay hidden without an explicit work-item identity", () => {
  const viewModel = buildRunDetailViewModel({
    thread: { id: "thread-a", status: "idle" },
    running: false,
    activeLines: [],
    files: [],
    results: [{ scope: "work_item", workItemId: "work-a", value: result }],
    contributions: {
      surfaceKind: "opl_app_ui_contributions_projection.v1",
      entries: [{
        contributionKey: "mas:hypotheses",
        contributionId: "hypotheses",
        packageId: "mas",
        slot: "runtime.detail",
        contributionKind: "view",
        trustTier: "declarative",
        scope: "work_item",
        sortOrder: 10,
        view: { viewId: "hypotheses", viewType: "list_detail", title: { en: "Hypotheses" }, dataRef: "mas.hypotheses#current" },
        commands: [],
        badges: []
      }]
    }
  });

  assert.equal(viewModel.status.state, "idle");
  assert.deepEqual(viewModel.results, []);
  assert.deepEqual(viewModel.runtimeDetails, []);
});

test("selected runtime work item supplies the detail agent and lifecycle status", () => {
  const viewModel = buildRunDetailViewModel({
    thread: { id: "thread-a", status: "active", agentRole: "Codex" },
    workItem: {
      workItemId: "work-a",
      status: "delivered_paused",
      agentDisplayName: "Med Auto Science",
      executionState: "idle"
    },
    workItemId: "work-a",
    running: true,
    activeLines: [],
    files: [],
    results: [],
    contributions: { surfaceKind: "opl_app_ui_contributions_projection.v1", entries: [] }
  });

  assert.equal(viewModel.status.state, "idle");
  assert.equal(viewModel.status.sourceStatus, "delivered_paused");
  assert.equal(viewModel.status.agentLabel, "Med Auto Science");
});

test("a new task reports an idle Codex run instead of an unavailable runtime", () => {
  const viewModel = buildRunDetailViewModel({
    thread: null,
    running: false,
    activeLines: [],
    files: [],
    results: [],
    contributions: {
      surfaceKind: "opl_app_ui_contributions_projection.v1",
      entries: []
    }
  });

  assert.equal(viewModel.status.state, "idle");
  assert.equal(viewModel.status.sourceStatus, "idle");
  assert.equal(viewModel.status.agentLabel, "Codex");
});
