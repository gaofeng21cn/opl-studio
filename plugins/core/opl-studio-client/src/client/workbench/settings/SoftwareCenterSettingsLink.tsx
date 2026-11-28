import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { SettingRow, SettingsGroup, StatusValue } from "./primitives";

export function SoftwareCenterSettingsLink({ locale, section = "applications", onOpen, appVersion, updateStatus }: {
  locale: "zh" | "en"; section?: "applications" | "updates";
  onOpen?: (section: "applications" | "updates") => void;
  appVersion?: string;
  updateStatus?: string;
}) {
  const zh = locale === "zh";
  return <SettingsGroup title={zh ? "软件中心" : "Software Center"}>
    {section === "updates" && appVersion ? (
      <SettingRow label={zh ? "当前应用版本" : "App version"} detail={zh ? "桌面端、组件版本检查与修复集中在软件中心执行" : "App updates, component checks and repair run in Software Center"}>
        <span className="runtime-setting-control">
          <span>{appVersion}</span>
          {updateStatus ? <StatusValue status={updateStatus} locale={locale} /> : null}
        </span>
      </SettingRow>
    ) : null}
    <SettingRow label={section === "updates" ? (zh ? "更新与维护" : "Updates & maintenance") : (zh ? "软件与智能体" : "Software & agents")} detail={zh ? "查看已装软件、版本与安装位置，统一安装、更新和卸载。" : "Review installed software, versions and locations; install, update and uninstall in one place."}>
      <Button variant="outline" size="sm" disabled={!onOpen} onClick={() => onOpen?.(section)}>{zh ? "打开软件中心" : "Open Software Center"}</Button>
    </SettingRow>
  </SettingsGroup>;
}
