import { deriveWorkbenchModelFromState } from "../../src/workbench/workbenchModel";

export function runtimeOverviewFixture(locale: "zh" | "en" = "zh") {
  const zh = locale === "zh";
  return deriveWorkbenchModelFromState({ app_state: {
    provider: { temporal: { details: { worker_readiness: {
      service_ready: false, worker_ready: false,
      temporal_service_lifecycle: { service_status: "supervisor_unready", supervisor: {
        applicable: true, required: true, ready: false, configuration_current: false, status: "configuration_drift"
      } }
    } } } },
    operator: { workbench: { work_item_projection_v2: {
      schema_version: "work-item-projection.v2", generated_at: "2026-11-13T01:30:00Z",
      summary: { running_count: 99, user_attention_count: 99 },
      agent_catalog: [{ agent_id: "research", display_name: zh ? "研究助手" : "Research assistant" }, { agent_id: "writing", display_name: zh ? "写作助手" : "Writing assistant" }],
      project_catalog: [{ project_id: "study", agent_id: "research", display_name: "Example-Study" }, { project_id: "report", agent_id: "writing", display_name: "Example-Report" }],
      items: [
        { id: "analysis", project: "study", agent: "research", title: zh ? "队列数据分析" : "Cohort data analysis", status: "automatically_advancing", label: zh ? "自动推进中" : "Automatically advancing", running: true },
        { id: "review", project: "report", agent: "writing", title: zh ? "研究报告修订" : "Research report revision", status: "awaiting_user_decision", label: zh ? "等待你决定" : "Waiting for your decision", attention: true },
        { id: "archive", project: "report", agent: "writing", title: zh ? "已完成的文献整理" : "Completed literature review", status: "delivered_auto_paused", label: zh ? "已交付自动暂停" : "Delivered and auto-paused", archived: true }
      ].map(item => ({
        item_id: item.id,
        identity: { agent_id: item.agent, agent_display_name: item.agent === "research" ? (zh ? "研究助手" : "Research assistant") : (zh ? "写作助手" : "Writing assistant"), project_id: item.project, project_display_name: item.project === "study" ? "Example-Study" : "Example-Report", work_item_id: item.id, work_item_display_name: item.title },
        lifecycle: { primary_state: item.status, primary_state_label: item.label },
        visibility: { state: item.archived ? "archived" : "visible" },
        execution: { state: item.running ? "running" : "idle", current_stage_id: "analysis", quality_budget: { elapsed_ms: item.running ? 720000 : null } },
        attention: { kind: item.attention ? "user" : "none" },
        action: { title: zh ? "确认分析方案后继续" : "Confirm the analysis plan to continue", owner_display_name: zh ? "研究团队" : "Research team" },
        telemetry: { current_stage: { total_tokens: null }, cumulative: { total_tokens: null } },
        stage_map: [{ stage_id: "analysis", display_name: "Analysis", display_names: { zh: "数据分析", en: "Data analysis" }, state: "active" }]
      }))
    } } }
  } });
}
