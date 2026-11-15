import { Button, StateDot, IconRefreshOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import { useState } from "react";
import { OnboardingModal } from "@deepseek-ai/dsh-client-ui-settings-models/src/client/OnboardingModal.tsx";
import type { SettingsDestinationId } from "../../workbench/SettingsPanel";
import { useStudio } from "./studioContext";
import { settingsSectionId } from "./shellSettingsSlots";

function firstRunItemLabel(itemId: string, fallback: string | undefined, locale: "zh" | "en"): string {
  const labels: Record<string, [string, string]> = {
    workspace_root: ["工作目录", "Working directory"],
    codex: ["本机助手", "Local assistant"],
    codex_cli: ["本机助手", "Local assistant"],
    codex_config: ["模型访问", "Model access"],
    domain_modules: ["专业能力", "Professional capabilities"],
    family_runtime_provider: ["后台任务服务", "Background task service"]
  };
  return labels[itemId]?.[locale === "zh" ? 0 : 1] ?? fallback ?? itemId;
}

export function FirstRunOnboardingSlot({
  complete,
  openSection
}: {
  complete(): void;
  openSection(id: string): void;
}) {
  const studio = useStudio();
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState("");
  const systemInitialize = studio.initialization?.systemInitialize;
  const setupFlow = systemInitialize?.setupFlow;
  const preparingRuntime = studio.installationState?.status === 'running'
    && !['ready', 'preparing_packages'].includes(studio.installationState.stage);
  const visible = preparingRuntime || (studio.initializationStatus === "ready"
    && Boolean(systemInitialize && setupFlow?.isFirstRun && setupFlow.readyToLaunch === false));
  if (!visible) return null;
  const coreItems = (systemInitialize?.checklist ?? []).filter((item) => item.readinessLayer === "core_launch");
  const nextCoreItemId = coreItems.find((item) => item.blocking)?.itemId ?? setupFlow?.phase;
  const destination: SettingsDestinationId = nextCoreItemId === "workspace_root" ? "workspace" : "account";
  const directSetup = nextCoreItemId === "workspace_root" && studio.setupCapabilities.workspaceRoot
    ? { label: studio.locale === "zh" ? "选择工作目录" : "Choose working directory", run: studio.chooseWorkspaceRoot }
    : ["codex", "codex_cli"].includes(nextCoreItemId ?? "") && studio.setupCapabilities.codexInstall
      ? { label: studio.locale === "zh" ? "安装本机助手" : "Install local assistant", run: studio.installCodex }
      : null;
  const runPrimarySetup = async () => {
    if (!directSetup) {
      complete();
      openSection(settingsSectionId(destination));
      return;
    }
    setSetupBusy(true);
    setSetupError("");
    try {
      const result = await directSetup.run();
      if (result.status === "error") setSetupError(result.message ?? (studio.locale === "zh" ? "此步骤未完成。" : "This step did not complete."));
    } catch {
      setSetupError(studio.locale === "zh" ? "此步骤未完成，请重新检查后重试。" : "This step did not complete. Check again and retry.");
    } finally { setSetupBusy(false); }
  };
  const zh = studio.locale === 'zh';
  return <OnboardingModal title={preparingRuntime ? (zh ? '正在准备 One Person Lab' : 'Preparing One Person Lab') : (zh ? '完成本机准备' : 'Finish local setup')} focusTitle>
    <div className="opl-first-run">
      {!preparingRuntime ? <p className="opl-first-run-intro">{zh ? '完成下面的本机设置，即可开始第一个任务。官方智能体会在后台继续准备。' : 'Finish local setup to start your first task. Official agents continue preparing in the background.'}</p> : null}
      {studio.installationProgress}
      {!preparingRuntime ? <div className="opl-first-run-checklist">
        {coreItems.map(item => {
          const ready = !item.blocking;
          return <div key={item.itemId} data-ready={ready}>
            <StateDot state={ready ? 'done' : 'warning'} appearance="step" size={18} />
            <span><strong>{firstRunItemLabel(item.itemId, item.label, studio.locale)}</strong><small>{ready ? (zh ? '已就绪' : 'Ready') : item.nextVisibleStep ?? (zh ? '需要设置' : 'Setup required')}</small></span>
          </div>;
        })}
      </div> : null}
      {setupError ? <p className="opl-first-run-error" role="alert">{setupError}</p> : null}
      <footer>
        {!preparingRuntime ? <Button variant="ghost" size="sm" aria-label={zh ? '重新检查' : 'Check again'} title={zh ? '重新检查' : 'Check again'} disabled={setupBusy} onClick={studio.refreshInitialization}><IconRefreshOutlineRegular size={16} /></Button> : null}
        <Button variant="ghost" disabled={setupBusy} onClick={complete}>{zh ? '进入 OPL' : 'Enter OPL'}</Button>
        {!preparingRuntime ? <Button variant="primary" disabled={setupBusy} onClick={() => { void runPrimarySetup(); }} icon={setupBusy ? <StateDot state="ongoing" /> : undefined}>
          {directSetup?.label ?? (zh ? '设置模型访问' : 'Set up model access')}
        </Button> : null}
      </footer>
    </div>
  </OnboardingModal>;
}
