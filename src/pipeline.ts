import { runDataAgent, type DataAgentResult } from "./agents/data-agent.js";
import { runModelAgent, type ModelAgentResult } from "./agents/model-agent.js";
import { runDecisionSynthesis } from "./agents/decision-synthesis.js";
import { getScenario } from "./scenarios.js";
import {
  getScenarioAssets,
  upsertKnowledgeNodes,
  upsertNegativeResults,
} from "./asset-store.js";
import { cacheScenario } from "./scenario-cache.js";
import type {
  Scenario,
  RunAnalysisRequest,
  DataObject,
  ModelObject,
  KnowledgeNode,
  NegativeResult,
  Signal,
} from "../schemas.js";

export interface AnalysisResult {
  scenario: Scenario;
}

export async function runAnalysis(request: RunAnalysisRequest): Promise<AnalysisResult> {
  const { scenario_id, query, mode, priority } = request;

  // Get scenario config
  const scenarioConfig = getScenario(scenario_id);
  if (!scenarioConfig) {
    throw new Error(`Scenario not found: ${scenario_id}`);
  }

  const context = scenarioConfig.context;
  const startTime = Date.now();
  console.log(`[Pipeline] Starting analysis for scenario: ${scenario_id}`);
  console.log(`[Pipeline] Query: ${query}`);

  // Step 1: Run Data Agent
  console.log("[Pipeline] Step 1: Running Data Agent...");
  const dataResult: DataAgentResult = await runDataAgent({
    query,
    context,
    mode,
  });
  console.log(`[Pipeline] Data Agent completed. Status: ${dataResult.status}`);

  // Step 2: Run Model Agent
  console.log("[Pipeline] Step 2: Running Model Agent...");
  const modelResult: ModelAgentResult = await runModelAgent({
    query,
    context,
    data: dataResult.object,
    priority,
  });
  console.log(`[Pipeline] Model Agent completed. Status: ${modelResult.status}`);

  // Step 3: Run Decision Synthesis
  console.log("[Pipeline] Step 3: Running Decision Synthesis...");
  const decisionResult = await runDecisionSynthesis({
    query,
    context,
    dataObject: dataResult.object,
    modelObject: modelResult.object,
    keyPapers: dataResult.key_papers,
  });
  console.log("[Pipeline] Decision Synthesis completed.");

  // Step 4: Update Asset Store
  console.log("[Pipeline] Step 4: Updating Asset Store...");
  const knowledgeNodes: KnowledgeNode[] = decisionResult.decision_output.knowledge_status.map(
    (s) => ({
      title: s.title,
      freshness: s.meta ?? new Date().getFullYear().toString(),
      status: "confirmed",
    })
  );

  const negativeResults: NegativeResult[] = decisionResult.decision_output.negative_paths.map(
    (s) => ({
      title: s.title,
      effect: s.text,
    })
  );

  if (knowledgeNodes.length > 0) {
    upsertKnowledgeNodes(scenario_id, knowledgeNodes);
  }
  if (negativeResults.length > 0) {
    upsertNegativeResults(scenario_id, negativeResults);
  }

  // Step 5: Build Scenario object
  console.log("[Pipeline] Step 5: Building Scenario object...");
  const assets = getScenarioAssets(scenario_id);

  const scenario: Scenario = {
    id: scenario_id,
    name: scenarioConfig.meta.name,
    status: scenarioConfig.meta.status,
    status_label: scenarioConfig.meta.status_label,
    one_liner: scenarioConfig.meta.one_liner,
    tags: scenarioConfig.meta.tags,
    overview: scenarioConfig.overview,
    positioning_quote: scenarioConfig.positioning_quote,
    suggested_query: scenarioConfig.default_query,
    hero_cards: scenarioConfig.hero_cards,
    last_updated: new Date().toISOString(),
    data_agent: {
      status: dataResult.status,
      object: dataResult.object,
      note: dataResult.note,
    },
    model_agent: {
      status: modelResult.status,
      object: modelResult.object,
      note: modelResult.note,
    },
    decision_output: decisionResult.decision_output,
    reasoning_trace: decisionResult.reasoning_trace,
    asset_store: assets,
  };

  // Cache the scenario
  cacheScenario(scenario);

  const elapsed = Date.now() - startTime;
  console.log(`[Pipeline] Analysis completed in ${elapsed}ms`);

  return { scenario };
}