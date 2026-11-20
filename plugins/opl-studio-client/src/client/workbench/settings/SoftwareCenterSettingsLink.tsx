import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { SettingRow, SettingsGroup } from "./primitives";

export function SoftwareCenterSettingsLink({ locale, section = "applications", onOpen }: {
  locale: "zh" | "en"; section?: "applications" | "updates";
  onOpen?: (section: "applications" | "updates") => void;
}) {
  const zh = locale === "zh";
  return <SettingsGroup title={zh ? "软件中心" : "Software Center"}>
    <SettingRow label={section === "updates" ? (zh ? "更新与维护" : "Updates & maintenance") : (zh ? "软件与智能体" : "Software & agents")} detail={zh ? "查看已装软件、版本与安装位置，统一安装、更新和卸载。" : "Review installed software, versions and locations; install, update and uninstall in one place."}>
      <Button variant="outline" size="sm" disabled={!onOpen} onClick={() => onOpen?.(section)}>{zh ? "打开软件中心" : "Open Software Center"}</Button>
    </SettingRow>
  </SettingsGroup>;
}
