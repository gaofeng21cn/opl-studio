import { useState } from "react";
import type { Context } from "@deepseek-ai/cordis";
import {
  Button,
  PluginErrorBoundary,
  SettingRow,
  SettingsGroup,
  StatusPill,
  registerOplSettingsGroup,
  useOplLocale,
  type OplSettingsGroupOwner,
  type OplSettingsGroupSlotRegistry
} from "@gaofeng21cn/opl-plugin-ui-kit";

export function ExampleTier2Panel() {
  const locale = useOplLocale();
  const zh = locale === "zh";
  const [healthy, setHealthy] = useState(true);

  return (
    <PluginErrorBoundary
      pluginId="@example/opl-tier2-devkit-plugin"
      pluginLabel={zh ? "示例扩展面板" : "Example Extension Panel"}
      locale={locale}
    >
      <section data-testid="example-tier2-panel">
        <h2>{zh ? "示例 Tier 2 扩展面板" : "Example Tier 2 Extension Panel"}</h2>
        <p>
          {zh
            ? "使用 @gaofeng21cn/opl-plugin-ui-kit 原语与 PluginErrorBoundary 构建，与宿主主题及错误隔离一致。"
            : "Built exclusively with @gaofeng21cn/opl-plugin-ui-kit primitives and PluginErrorBoundary."}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => setHealthy((current) => !current)}>
          {healthy ? (zh ? "切换为检查中" : "Mark checking") : (zh ? "恢复就绪" : "Mark ready")}
        </Button>
      </section>
    </PluginErrorBoundary>
  );
}

export function ExampleTier2SettingsCard({ locale }: OplSettingsGroupOwner) {
  const zh = useOplLocale(locale) === "zh";
  const [enabled, setEnabled] = useState(true);

  return (
    <SettingsGroup
      packageId="@example/opl-tier2-devkit-plugin"
      title={zh ? "示例扩展设置" : "Example extension settings"}
      description={zh
        ? "通过 settings.group.capabilities 受控槽位接入，自动具备搜索索引与主题一致性。"
        : "Contributed into settings.group.capabilities with bilingual search metadata and host theme consistency."}
    >
      <SettingRow label={zh ? "扩展状态" : "Extension state"}>
        <span className="runtime-setting-control">
          <StatusPill state={enabled ? "done" : "idle"} label={enabled ? (zh ? "已就绪" : "Ready") : (zh ? "已暂停" : "Paused")} />
          <Button type="button" size="sm" variant="outline" onClick={() => setEnabled((value) => !value)}>
            {enabled ? (zh ? "暂停" : "Pause") : (zh ? "启用" : "Enable")}
          </Button>
        </span>
      </SettingRow>
    </SettingsGroup>
  );
}

export const exampleTier2ClientPlugin = {
  name: "example-tier2-devkit-plugin-client",
  inject: ["slots"],
  apply(ctx: Context) {
    const slots = ctx.get("slots") as OplSettingsGroupSlotRegistry;
    registerOplSettingsGroup(
      slots,
      {
        id: "example-tier2-settings",
        destination: "capabilities",
        packageId: "@example/opl-tier2-devkit-plugin",
        order: 90,
        registrant: "example-tier2-devkit-plugin",
        titleI18n: { zh: "示例扩展设置", en: "Example extension settings" },
        searchKeywords: "example tier2 devkit capabilities 示例 扩展"
      },
      ExampleTier2SettingsCard
    );
  }
};

export default exampleTier2ClientPlugin;
