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
  const read = bridge?.readBillionContext;
  const write = bridge?.setBillionContext;
  const [preference, setPreference] = useState<BillionContextPreference>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    read?.().then(value => {
      if (mounted) setPreference(value);
    }, () => {
      if (mounted) setError(true);
    });
    return () => { mounted = false; };
  }, [read]);

  if (!read || !write) return null;
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
      setPreference(await write!({ enabled }));
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
