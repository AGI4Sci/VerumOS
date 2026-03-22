import type { Context } from "hono";
import {
  addExpertCorrection,
  getScenarioAssets,
  getAssetMetrics,
} from "../asset-store.js";
import { getCachedScenario, cacheScenario } from "../scenario-cache.js";
import type {
  ExpertCorrectionRequest,
  ExpertCorrectionResponse,
  Scenario,
  Signal,
} from "../schemas.js";

function correctionToSignal(correction: {
  expert: string;
  from: string;
  to: string;
  reason: string;
  timestamp: string;
}): Signal {
  return {
    title: `${correction.expert} 修正`,
    meta: correction.timestamp.slice(0, 10),
    text: `原判断：${correction.from} → 修正为：${correction.to}。理由：${correction.reason}`,
  };
}

export async function handleExpertCorrection(c: Context) {
  const request = c.req.valid("json") as ExpertCorrectionRequest;
  const { scenario_id, expert, from, to, reason } = request;

  // 1. Write to asset store
  addExpertCorrection(scenario_id, { expert, from, to, reason });

  // 2. Get cached scenario
  const cached = getCachedScenario(scenario_id);
  if (!cached) {
    return c.json(
      {
        error: "请先运行一次分析再提交专家修正",
        message: "No analysis found for this scenario. Please run analysis first.",
      },
      400
    );
  }

  // 3. Rebuild expert_revised_judgment
  const assets = getScenarioAssets(scenario_id);
  const expertSignals = assets.expert_corrections.map(correctionToSignal);

  // 4. Update scenario
  const updated: Scenario = {
    ...cached,
    asset_store: assets,
    decision_output: {
      ...cached.decision_output,
      expert_revised_judgment: expertSignals,
    },
    last_updated: new Date().toISOString(),
  };

  cacheScenario(updated);

  const response: ExpertCorrectionResponse = {
    asset_store: {
      metrics: getAssetMetrics(),
    },
    scenario: updated,
  };

  return c.json(response);
}