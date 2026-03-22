import type { Context } from "hono";
import { runAnalysis } from "../pipeline.js";
import { getAssetMetrics } from "../asset-store.js";
import type { RunAnalysisRequest, RunAnalysisResponse } from "../schemas.js";

export async function handleRunAnalysis(c: Context) {
  const request = c.req.valid("json") as RunAnalysisRequest;

  try {
    const result = await runAnalysis(request);

    const response: RunAnalysisResponse = {
      asset_store: {
        metrics: getAssetMetrics(),
      },
      scenario: result.scenario,
    };

    return c.json(response);
  } catch (err) {
    console.error("[RunAnalysis] Error:", err);
    return c.json(
      {
        error: "Analysis failed",
        message: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
}