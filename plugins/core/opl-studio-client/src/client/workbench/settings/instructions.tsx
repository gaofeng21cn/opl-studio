import { ChevronDown, LoaderCircle, RefreshCw, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { WorkbenchSettingsProjection } from "../workbenchModel";

import type { WorkbenchSettings } from "../settingsModel";

import { type SettingsActionRequest } from "../settingsActions";

import { formatBytes } from "./presentation";
import { SettingsGroup, StatusValue } from "./primitives";

export function CodexInstructionsEditor({
  userAgents,
  defaultAgents,
  additionalInstructions,
  locale,
  busyKey,
  onRefresh,
  onAction,
  onAdditionalInstructionsChange
}: {
  userAgents?: WorkbenchSettingsProjection["personalization"]["userAgents"];
  defaultAgents?: WorkbenchSettingsProjection["personalization"]["oplFlowDefaultUserAgents"];
  additionalInstructions: string;
  locale: WorkbenchSettings["locale"];
  busyKey: string | null;
  onRefresh: () => void;
  readMemory?: () => Promise<import("../../bridge/oplBridge").OplFullDrilldownReadback>;
  onAction: (request: SettingsActionRequest) => void;
  onAdditionalInstructionsChange: (value: string) => void;
}) {
  const [userDraft, setUserDraft] = useState(userAgents?.content ?? "");
  const [additionalDraft, setAdditionalDraft] = useState(additionalInstructions);
  const [additionalSaved, setAdditionalSaved] = useState(false);
  const sameAsDefault = Boolean(userAgents?.sha256 && defaultAgents?.sha256 && userAgents.sha256 === defaultAgents.sha256);
  const refreshLabel = locale === "zh" ? "刷新本机指令" : "Refresh local instructions";
  const saveLabel = locale === "zh" ? "保存本机指令" : "Save local instructions";
  const restoreLabel = locale === "zh" ? "恢复 OPL Flow 默认" : "Restore OPL Flow default";

  const userBaseline = useRef({ content: userAgents?.content ?? "", sha256: userAgents?.sha256 });
  const [sourceChanged, setSourceChanged] = useState(false);
  useEffect(() => {
    if (userDraft === userBaseline.current.content || userDraft === userAgents?.content) {
      setUserDraft(userAgents?.content ?? "");
      userBaseline.current = { content: userAgents?.content ?? "", sha256: userAgents?.sha256 };
      setSourceChanged(false);
    } else if (userBaseline.current.sha256 !== userAgents?.sha256) setSourceChanged(true);
  }, [userAgents?.content, userAgents?.sha256]);
  useEffect(() => setAdditionalDraft(additionalInstructions), [additionalInstructions]);

  return (
    <>
      <SettingsGroup title={locale === "zh" ? "本机指令" : "Local instructions"}>
        <div className="settings-editor-block" data-testid="opl-settings-user-instructions-editor">
          <div className="settings-editor-heading">
            <span>
              <strong>AGENTS.md</strong>
              <small>{locale === "zh" ? "Codex 会在本机任务中读取这个用户文件" : "Codex reads this user file for local tasks"}</small>
            </span>
            <StatusValue status={userAgents?.status} locale={locale} />
          </div>
          <textarea
            value={userDraft}
            aria-label={locale === "zh" ? "本机 Codex 指令" : "Local Codex instructions"}
            spellCheck={false}
            onChange={(event) => setUserDraft(event.currentTarget.value)}
          />
          {userDraft !== (userAgents?.content ?? "") ? <p className="settings-inline-note" role="status">{sourceChanged ? (locale === "zh" ? "原文件已变更，草稿已保留。请先复制草稿并与最新内容核对，再保存。" : "The source changed. Your draft is preserved; copy it and reconcile with the latest content before saving.") : (locale === "zh" ? "有未保存的修改" : "Unsaved changes")}</p> : null}
          <div className="settings-editor-footer">
            <small>{userAgents?.path ?? (locale === "zh" ? "本机指令路径尚未就绪" : "The local instruction path is not ready")}{userAgents?.sizeBytes !== undefined ? ` · ${formatBytes(userAgents.sizeBytes, locale === "zh" ? "zh-CN" : "en-US")}` : ""}</small>
            <span className="settings-row-actions">
              <button className="settings-icon-button" type="button" aria-label={refreshLabel} title={refreshLabel} disabled={busyKey !== null} onClick={onRefresh}>
                <RefreshCw aria-hidden="true" size={15} />
              </button>
              <button
                className="settings-action-button"
                type="button"
                disabled={busyKey !== null || sourceChanged || userDraft === (userAgents?.content ?? "")}
                onClick={() => onAction({
                  key: "instructions:user:save",
                  actionId: "codex_user_instructions_set",
                  label: saveLabel,
                  payload: { content: userDraft, expected_sha256: userBaseline.current.sha256 ?? null },
                  confirmationRequired: false
                })}
              >
                {busyKey === "instructions:user:save" ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : <Save aria-hidden="true" size={13} />}
                {locale === "zh" ? "保存" : "Save"}
              </button>
            </span>
          </div>
          <div className="settings-default-row">
            <span>
              <strong>{locale === "zh" ? "OPL Flow 默认" : "OPL Flow default"}</strong>
              <small>{sameAsDefault
                ? (locale === "zh" ? "当前本机指令已使用此默认内容" : "The local file currently matches this default")
                : defaultAgents?.status === "available"
                  ? (locale === "zh" ? `可恢复${defaultAgents.packageVersion ? ` · 版本 ${defaultAgents.packageVersion}` : ""}` : `Available to restore${defaultAgents.packageVersion ? ` · version ${defaultAgents.packageVersion}` : ""}`)
                  : (defaultAgents?.reason ?? (locale === "zh" ? "默认内容当前不可用" : "The default is currently unavailable"))}
              </small>
            </span>
            <button
              className="settings-action-button"
              type="button"
              disabled={busyKey !== null || defaultAgents?.status !== "available" || sameAsDefault}
              onClick={() => onAction({
                key: "instructions:user:restore",
                actionId: "codex_user_instructions_restore_opl_flow_default",
                label: restoreLabel,
                payload: { expected_sha256: userAgents?.sha256 ?? null },
                confirmationRequired: true
              })}
            >
              {busyKey === "instructions:user:restore" ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : <RotateCcw aria-hidden="true" size={13} />}
              {locale === "zh" ? "恢复默认" : "Restore default"}
            </button>
          </div>
          {defaultAgents?.status === "available" && defaultAgents.content ? (
            <details className="settings-default-preview">
              <summary>
                <span>{locale === "zh" ? "查看 OPL Flow 默认内容" : "View OPL Flow default"}</span>
                <ChevronDown aria-hidden="true" size={14} />
              </summary>
              <pre aria-label={locale === "zh" ? "OPL Flow 默认指令只读预览" : "Read-only OPL Flow default instructions"}>{defaultAgents.content}</pre>
            </details>
          ) : null}
        </div>
      </SettingsGroup>
      <SettingsGroup title={locale === "zh" ? "新会话附加指令" : "New conversation instructions"}>
        <div className="settings-editor-block" data-testid="opl-settings-additional-instructions-editor">
          <label className="settings-editor-label">
            <span>{locale === "zh" ? "仅在之后新建的会话中附加；现有会话不会改变" : "Added only to conversations created afterward; existing conversations do not change"}</span>
            <textarea
              value={additionalDraft}
              aria-label={locale === "zh" ? "新会话附加指令" : "Additional instructions for new conversations"}
              placeholder={locale === "zh" ? "留空表示不附加任何内容" : "Leave blank to inject nothing"}
              spellCheck={false}
              onChange={(event) => { setAdditionalDraft(event.currentTarget.value); setAdditionalSaved(false); }}
            />
          </label>
          <div className="settings-editor-footer">
            <small role="status">{additionalSaved ? (locale === "zh" ? "已保存，将从下一个新会话生效" : "Saved; applies to the next new conversation") : ""}</small>
            <span className="settings-row-actions">
              <button
                className="settings-icon-button"
                type="button"
                aria-label={locale === "zh" ? "清空附加指令" : "Clear additional instructions"}
                title={locale === "zh" ? "清空附加指令" : "Clear additional instructions"}
                disabled={!additionalDraft}
                onClick={() => { setAdditionalDraft(""); setAdditionalSaved(false); }}
              >
                <Trash2 aria-hidden="true" size={15} />
              </button>
              <button
                className="settings-action-button"
                type="button"
                disabled={additionalDraft.trim() === additionalInstructions}
                onClick={() => {
                  onAdditionalInstructionsChange(additionalDraft);
                  setAdditionalDraft(additionalDraft.trim());
                  setAdditionalSaved(true);
                }}
              >
                <Save aria-hidden="true" size={13} />
                {locale === "zh" ? "保存" : "Save"}
              </button>
            </span>
          </div>
        </div>
      </SettingsGroup>
    </>
  );
}
