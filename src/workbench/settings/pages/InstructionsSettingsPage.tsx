import { SettingRow, SettingsGroup, StatusValue } from "../../settings/primitives";

import { CodexInstructionsEditor } from "../../settings/instructions";
import { MemoryManagerPanel } from "../../plugins/WorkbenchServicesPanel";
import { MemoryRefsPanel } from "../../MemoryRefsPanel";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function InstructionsSettingsPage({ projection, settings, readbackStatus, additionalConversationInstructions, actionBusyKey, onRefresh, onAction, onAdditionalConversationInstructionsChange, zh, model, workbenchServices, serviceRevision, readMemory }: Pick<SettingsPageContext, "projection" | "settings" | "readbackStatus" | "additionalConversationInstructions" | "actionBusyKey" | "onRefresh" | "onAction" | "onAdditionalConversationInstructionsChange" | "zh" | "model" | "workbenchServices" | "serviceRevision" | "readMemory">) {

      const userAgents = projection?.personalization.userAgents;
      const defaultAgents = projection?.personalization.oplFlowDefaultUserAgents;
      return (
        <>
          <div className="settings-page-summary"><span>{settings.locale === "zh" ? "本机 AGENTS.md 与新会话附加指令" : "Local AGENTS.md and new-conversation instructions"}</span><StatusValue status={readbackStatus} locale={settings.locale} /></div>
          <CodexInstructionsEditor
            userAgents={userAgents}
            defaultAgents={defaultAgents}
            additionalInstructions={additionalConversationInstructions}
            locale={settings.locale}
            busyKey={actionBusyKey}
            onRefresh={onRefresh}
            onAction={onAction}
            onAdditionalInstructionsChange={onAdditionalConversationInstructionsChange}
          />
          <details id="settings-memory-context" className="settings-secondary-details">
            <summary>{zh ? "记忆与纠错" : "Memory and corrections"}</summary>
            {settings.locale === "zh"
              ? <p className="settings-inline-note">记忆由独立记忆系统管理；提交纠错会创建建议，不会直接改写主记忆。</p>
              : <p className="settings-inline-note">Memory has its own owner. Corrections create suggestions and do not directly rewrite canonical memory.</p>}
            {workbenchServices
              ? <MemoryManagerPanel client={workbenchServices} locale={settings.locale} onAction={onAction} busy={actionBusyKey !== null} revision={serviceRevision} />
              : <p role="status">{zh ? "记忆服务尚未连接。" : "Memory service is not connected."}</p>}
            {readMemory ? <details className="settings-secondary-details"><summary>{zh ? "记忆来源详情" : "Memory source details"}</summary><MemoryRefsPanel locale={settings.locale} read={readMemory} /></details> : null}
          </details>
          <details className="settings-secondary-details"><summary>{zh ? "技术来源" : "Technical sources"}</summary><SettingsGroup title={settings.locale === "zh" ? "当前上下文来源" : "Current context sources"}>
            {model.contextSources.length ? model.contextSources.map((source) => (
              <SettingRow key={source.id} label={source.label} detail={source.summary}><code>{source.ref}</code></SettingRow>
            )) : <SettingRow label={settings.locale === "zh" ? "上下文" : "Context"}><span className="settings-muted">{settings.locale === "zh" ? "当前没有额外上下文来源" : "No additional context sources"}</span></SettingRow>}
          </SettingsGroup></details>
        </>
      );

}
