import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../src/integrations/deepseek-harness/theme";
import { codexWorkbenchStyles } from "../../src/workbench/codexWorkbenchStyles";
import { RuntimeOverviewPage } from "../../src/workbench/RuntimeOverviewPage";
import { deriveServiceRecoveryModel } from "../../src/workbench/serviceRecoveryModel";
import { runtimeOverviewFixture } from "../fixtures/runtime-overview";

// Uses the shipped renderer and DSH theme, with deterministic owner projections.
const evidence = { maintenance: 0, refresh: 0 };
function Fixture() {
  const [scenario, setScenario] = useState("drift");
  const [locale, setLocale] = useState<"zh" | "en">("zh");
  Object.assign(window, { runtimeEvidence: evidence, setRuntimeScenario: setScenario, setRuntimeLocale: setLocale });
  const model = runtimeOverviewFixture(locale);
  const absent = ["loading", "failed"].includes(scenario);
  return <><style>{codexWorkbenchStyles}{`body { margin: 0; } #root { min-height: 100vh; }`}</style><RuntimeOverviewPage
    key={`${locale}:${scenario}`} locale={locale}
    projection={absent ? undefined : scenario === "empty" ? { ...model.workItemRuntime!, items: [] } : model.workItemRuntime}
    serviceRecovery={scenario === "unknown" ? deriveServiceRecoveryModel({}) : scenario === "healthy" ? undefined : model.serviceRecovery}
    stateStatus={scenario === "loading" ? "loading" : ["failed", "cached"].includes(scenario) ? "error" : "ready"}
    snapshotSource={scenario === "cached" ? "cached" : absent ? "none" : "live"}
    onRefresh={() => { evidence.refresh++; }} onOpenMaintenance={() => { evidence.maintenance++; }} onOpenWorkItem={() => {}}
  /></>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
