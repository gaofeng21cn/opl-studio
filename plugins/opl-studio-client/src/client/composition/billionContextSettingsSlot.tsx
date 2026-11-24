import { useEffect, useState } from "react";
import type { BillionContextPreference, OplBridge } from "@gaofeng21cn/opl-host-contracts";
import {
  SettingRow,
  Switch,
  registerOplSettingsGroup,
  type OplSettingsGroupOwner,
  type OplSettingsGroupSlotRegistry
} from "@gaofeng21cn/opl-dsh-adapters/ui-kit";

export function BillionContextSettingsSection({
  zh,
  bridge,
  onManage
}: {
  zh: boolean;
  bridge?: Pick<OplBridge, "readBillionContext" | "setBillionContext">;
  onManage?: () => void;
}) {
  const hostBridge = typeof window === "undefined" ? undefined : window.oplStudio;
  const read = bridge?.readBillionContext;
  const write = bridge?.setBillionContext;
  const [preference, setPreference] = useState<BillionContextPreference>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadFromCatalog = typeof hostBridge?.readDshPluginCatalog === "function"
      ? hostBridge.readDshPluginCatalog().then(catalog => {
        const entry = catalog.entries.find(item => item.pluginId === "billion-context");
        if (!entry) return undefined;
        return {
          enabled: entry.enabled,
          installed: entry.installed,
          version: entry.version,
          availableVersion: entry.availableVersion,
          updateAvailable: entry.updateAvailable,
          activeVersion: entry.activeVersion,
          active: entry.active,
          startupFailed: entry.startupFailed,
          pendingOperation: entry.pendingOperation,
          pendingVersion: entry.pendingVersion
        } satisfies BillionContextPreference;
      })
      : undefined;
    const loader = read ? read() : loadFromCatalog;
    loader?.then(value => {
      if (mounted && value) setPreference(value);
    }, () => {
      if (mounted) setError(true);
    });
    return () => { mounted = false; };
  }, [hostBridge, read]);

  if (!read && !hostBridge?.readDshPluginCatalog) return null;
  if (!write && !hostBridge?.manageDshPlugin) return null;
  const detail = zh
    ? "通过本机代理压缩 Codex 长对话，并在本机保存可恢复的上下文。重启后应用。"
    : "Compress long Codex conversations through a local proxy and store recoverable context on this host. Applies after restart.";
  const status = error
    ? (zh ? "无法读取或保存设置" : "Could not read or save the preference")
    : preference?.enabled && preference.startupFailed
      ? (zh ? "代理启动失败，已切回原生 Codex" : "Proxy startup failed. Switched to native Codex.")
      : preference && preference.enabled !== preference.active
        ? (zh ? "等待重启" : "Restart pending")
        : null;

  async function change(enabled: boolean) {
    setBusy(true);
    setError(false);
    try {
      if (write) {
        setPreference(await write({ enabled }));
      } else if (hostBridge?.manageDshPlugin) {
        const catalog = await hostBridge.manageDshPlugin({ pluginId: "billion-context", operation: enabled ? "enable" : "disable" });
        const entry = catalog.entries.find(item => item.pluginId === "billion-context");
        if (entry) {
          setPreference({
            enabled: entry.enabled,
            installed: entry.installed,
            version: entry.version,
            availableVersion: entry.availableVersion,
            updateAvailable: entry.updateAvailable,
            activeVersion: entry.activeVersion,
            active: entry.active,
            startupFailed: entry.startupFailed,
            pendingOperation: entry.pendingOperation,
            pendingVersion: entry.pendingVersion
          });
        }
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SettingRow label="Billion Context" detail={detail}>
        {preference && !preference.installed && !preference.enabled && onManage
          ? <button className="settings-inline-command" type="button" onClick={onManage}>{zh ? "在软件中心管理" : "Manage in Software Center"}</button>
          : <Switch label="Billion Context" checked={preference?.enabled ?? false} disabled={!preference || busy} onChange={change} />}
      </SettingRow>
      {status ? <p className="settings-inline-note" role="status">{status}</p> : null}
    </>
  );
}

export function registerBillionContextSettingsSlot(slots: OplSettingsGroupSlotRegistry) {
  return registerOplSettingsGroup(
    slots,
    {
      id: "billion-context",
      destination: "models",
      packageId: "billion-context",
      order: 20,
      registrant: "opl-studio",
      titleI18n: { zh: "Billion Context", en: "Billion Context" },
      searchKeywords: "billion context proxy 长对话 压缩"
    },
    (owner: OplSettingsGroupOwner) => (
      <BillionContextSettingsSection
        zh={owner.locale === "zh"}
        bridge={owner.billionContext}
        onManage={owner.openSoftwareCenter
          ? () => owner.openSoftwareCenter?.("applications", "billion-context")
          : undefined}
      />
    )
  );
}
