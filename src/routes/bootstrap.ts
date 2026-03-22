import type { Context } from "hono";
import { SCENARIOS, DEFAULT_SCENARIO_ID, getDefaultQuery } from "../scenarios.js";
import { getAssetMetrics } from "../asset-store.js";
import type { BootstrapResponse } from "../schemas.js";

export async function handleBootstrap(c: Context) {
  const response: BootstrapResponse = {
    scenarios: SCENARIOS.map((s) => s.meta),
    schemas: {
      data_object: {
        required: ["source", "created_at", "quality_score", "ontology_tags", "processing_history"],
      },
      model_object: {
        required: ["protocol_version", "result", "reasoning_trace", "model_params", "excluded_paths"],
      },
    },
    asset_store: {
      metrics: getAssetMetrics(),
    },
    default_scenario_id: DEFAULT_SCENARIO_ID,
    default_query: getDefaultQuery(DEFAULT_SCENARIO_ID),
  };

  return c.json(response);
}