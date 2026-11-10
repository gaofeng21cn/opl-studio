import { Switch } from "@deepseek-ai/dsh-client-ui-primitives";
import { ShortcutSettings } from "../ShortcutSettings";
import { voiceRecognitionProvider } from "../../VoiceInput";


import { en as themeEn, zh as themeZh } from "../../../vendor/deepseek-harness/packages/client/ui-theme/src/client/locales";

import { StudioAppearanceRow, StudioFontSizeRow } from "../../settings/types";

import { SettingRow, SettingsGroup } from "../../settings/primitives";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function PreferencesSettingsPage({ settings, renderSettingControl, onSettingChange, zh, setPermissionAcknowledged, setPermissionConfirmation, navigate }: Pick<SettingsPageContext, "settings" | "renderSettingControl" | "onSettingChange" | "zh" | "setPermissionAcknowledged" | "setPermissionConfirmation" | "navigate">) {
      const themeCopy: Readonly<Record<string, string>> = settings.locale === "zh" ? themeZh : themeEn;

      return (
        <>
          <SettingsGroup title={settings.locale === "zh" ? "界面" : "Interface"}>
            <SettingRow label={settings.locale === "zh" ? "语言" : "Language"}>{renderSettingControl("locale")}</SettingRow>
            <div className="settings-appearance" data-slot="settings.general.item"><StudioAppearanceRow
              t={(key) => themeCopy[key] ?? key}
              setTheme={(theme) => onSettingChange("theme", theme)}
              useStore={(selector) => selector({ preference: settings.theme, revision: 0 })}
              actions={{ sync: () => undefined }}
            /></div>
            <div className="settings-font-size" data-slot="settings.general.item"><StudioFontSizeRow role="text" t={(key) => themeCopy[key] ?? key} setFontSize={(fontSize) => onSettingChange("fontSize", fontSize)} useStore={(selector) => selector({ fontSizes: { text: settings.fontSize, code: settings.fontSize, terminal: settings.fontSize }, fontFamilies: { text: "", code: "", terminal: "" }, revision: 0 })} actions={{ sync: () => undefined }} /></div>
          </SettingsGroup>
          <SettingsGroup title={settings.locale === "zh" ? "执行" : "Execution"}>
            <SettingRow label={settings.locale === "zh" ? "任务完成通知" : "Task completion notifications"}>{renderSettingControl("notificationEnabled")}</SettingRow>

            <SettingRow label={settings.locale === "zh" ? "新任务工作区" : "New task workspace"} detail={zh ? "跟随创建任务时选择的项目。" : "Uses the project selected when creating a task."}><button className="settings-inline-command" type="button" onClick={() => navigate("workspace")}>{zh ? "管理工作目录" : "Manage working directory"}</button></SettingRow>
          </SettingsGroup>
          <ShortcutSettings zh={zh} />
          <SettingsGroup title={zh ? "语音输入" : "Voice input"}><SettingRow label={zh ? "输入框听写" : "Composer dictation"} detail={voiceRecognitionProvider() ? (zh ? "启用后点击输入框麦克风。语音交由浏览器语音服务识别，识别文本只加入草稿，不自动发送。" : "Enable the composer microphone. Audio is processed by the browser speech service; text is added to the draft and never sent automatically.") : (zh ? "此运行环境未提供语音识别。可用系统听写，或在支持语音识别的浏览器中打开网页端。" : "Speech recognition is unavailable in this runtime. Use system dictation or open WebUI in a supporting browser.")}><Switch label={zh ? "输入框听写" : "Composer dictation"} disabled={!voiceRecognitionProvider()} checked={settings.voiceInput} onChange={value => onSettingChange("voiceInput", value)} /></SettingRow></SettingsGroup>
        </>
      );

}
