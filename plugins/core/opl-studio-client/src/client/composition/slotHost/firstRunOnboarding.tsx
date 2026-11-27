import { Button, StateDot, IconRefreshOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { OnboardingModal } from "@deepseek-ai/dsh-client-ui-settings-models/src/client/OnboardingModal.tsx";
import { useStudio } from "./studioContext";

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

export function FirstRunSidebarEntry({ wide }: { wide: boolean }) {
  const studio = useStudio();
  if (studio.firstRunVisible || studio.initializationStatus !== "ready"
    || studio.initialization?.systemInitialize.setupFlow.readyToLaunch !== false) return null;
  const label = studio.locale === "zh" ? "完成首次设置" : "Finish setup";
  return <Button variant="ghost" data-testid="opl-first-run-resume-entry" aria-label={label} title={label}
    icon={<ClipboardList size={16} aria-hidden="true" />} onClick={studio.openFirstRun}>{wide ? label : null}</Button>;
}

export function FirstRunOnboardingSlot({ complete }: { complete(): void }) {
  const studio = useStudio();
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState("");
  const systemInitialize = studio.initialization?.systemInitialize;
  const setupFlow = systemInitialize?.setupFlow;
  const preparingRuntime = studio.installationState?.status === 'running'
    && !['ready', 'preparing_packages'].includes(studio.installationState.stage);
  if (!studio.firstRunVisible) return null;
  const ready = studio.initializationStatus === "ready" ? setupFlow?.readyToLaunch : undefined;
  const finish = () => {
    studio.completeFirstRun();
    complete();
  };
  const coreItems = (systemInitialize?.checklist ?? []).filter((item) => item.readinessLayer === "core_launch");
  const nextCoreItemId = coreItems.find((item) => item.blocking)?.itemId ?? setupFlow?.phase;
  const zh = studio.locale === "zh";
  const isWorkspace = nextCoreItemId === "workspace_root";
  const isAssistant = nextCoreItemId === "codex" || nextCoreItemId === "codex_cli";
  const directSetup = isWorkspace && studio.setupCapabilities.workspaceRoot
    ? { label: zh ? "选择工作目录" : "Choose working directory", run: studio.chooseWorkspaceRoot }
    : isAssistant && studio.setupCapabilities.codexInstall
      ? { label: zh ? "安装本机助手" : "Install local assistant", run: studio.installCodex }
      : null;
  const settingsStep = isWorkspace
    ? { destination: "workspace" as const, label: zh ? "查看工作目录" : "View working directory" }
    : isAssistant
      ? { destination: "updates" as const, label: zh ? "查看本机助手" : "View local assistant" }
      : { destination: "account" as const, label: zh ? "设置模型访问" : "Set up model access" };
  const runPrimarySetup = async () => {
    if (!directSetup) {
      finish();
      studio.openSettingsDestination(settingsStep.destination);
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
  const title = preparingRuntime ? (zh ? '正在准备 One Person Lab' : 'Preparing One Person Lab')
    : ready === true ? (zh ? '本机已就绪' : 'Local setup is complete') : (zh ? '完成本机准备' : 'Finish local setup');
  const intro = ready === true ? (zh ? '可以开始第一个任务了。' : 'You can start your first task.')
    : ready === false ? (zh ? '完成下面的本机设置，即可开始第一个任务。官方智能体会在后台继续准备。' : 'Finish local setup to start your first task. Official agents continue preparing in the background.')
    : studio.initializationStatus === "loading" ? (zh ? '正在检查本机设置…' : 'Checking local setup…')
    : (zh ? '暂时无法确认本机设置，可以重新检查。' : 'Local setup could not be confirmed. You can check again.');
  return <OnboardingModal title={title} focusTitle>
    <div className="opl-first-run">
      {!preparingRuntime ? <p className="opl-first-run-intro">{intro}</p> : null}
      {studio.installationProgress}
      {!preparingRuntime && ready === false ? <div className="opl-first-run-checklist">
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
        {!preparingRuntime && ready !== true ? <Button variant="ghost" size="sm" aria-label={zh ? '重新检查' : 'Check again'} title={zh ? '重新检查' : 'Check again'} disabled={setupBusy || studio.initializationStatus === "loading"} onClick={studio.refreshInitialization}><IconRefreshOutlineRegular size={16} /></Button> : null}
        <Button variant={ready === true ? "primary" : "ghost"} data-testid="opl-first-run-enter-app" disabled={setupBusy} onClick={finish}>{zh ? '进入 OPL' : 'Enter OPL'}</Button>
        {!preparingRuntime && ready === false && nextCoreItemId ? <Button variant="primary" disabled={setupBusy} onClick={() => { void runPrimarySetup(); }} icon={setupBusy ? <StateDot state="ongoing" /> : undefined}>
          {directSetup?.label ?? settingsStep.label}
        </Button> : null}
      </footer>
    </div>
  </OnboardingModal>;
}
