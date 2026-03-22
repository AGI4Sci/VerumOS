import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Core Data Objects
// ─────────────────────────────────────────────────────────────────────────────

// DataObject - Data Agent output
export const DataObjectSchema = z.object({
  source: z.string(),
  created_at: z.string(),
  quality_score: z.string(),
  ontology_tags: z.array(z.string()),
  processing_history: z.array(z.string()),
});
export type DataObject = z.infer<typeof DataObjectSchema>;

// ModelObject - Model Agent output
export const ModelObjectSchema = z.object({
  protocol_version: z.string(),
  result: z.string(),
  reasoning_trace: z.string(),
  model_params: z.array(z.string()),
  excluded_paths: z.array(z.string()),
});
export type ModelObject = z.infer<typeof ModelObjectSchema>;

// Signal - Evidence entry (reused in multiple places)
export const SignalSchema = z.object({
  title: z.string(),
  meta: z.string().optional(),
  text: z.string(),
});
export type Signal = z.infer<typeof SignalSchema>;

// TraceStep - Reasoning step
export const TraceStepSchema = z.object({
  title: z.string(),
  label: z.string(),
  status: z.enum(["done", "active", "warn"]),
  text: z.string(),
  note: z.string().optional(),
});
export type TraceStep = z.infer<typeof TraceStepSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Asset Store Types
// ─────────────────────────────────────────────────────────────────────────────

// ExpertCorrection - Expert correction record
export const ExpertCorrectionSchema = z.object({
  expert: z.string(),
  from: z.string(),
  to: z.string(),
  reason: z.string(),
  timestamp: z.string(),
});
export type ExpertCorrection = z.infer<typeof ExpertCorrectionSchema>;

// KnowledgeNode - Knowledge node
export const KnowledgeNodeSchema = z.object({
  title: z.string(),
  freshness: z.string(),
  status: z.string(),
});
export type KnowledgeNode = z.infer<typeof KnowledgeNodeSchema>;

// NegativeResult - Negative result
export const NegativeResultSchema = z.object({
  title: z.string(),
  effect: z.string(),
});
export type NegativeResult = z.infer<typeof NegativeResultSchema>;

// ScenarioAssetStore - Scenario-level assets
export const ScenarioAssetStoreSchema = z.object({
  expert_corrections: z.array(ExpertCorrectionSchema),
  knowledge_nodes: z.array(KnowledgeNodeSchema),
  negative_results: z.array(NegativeResultSchema),
});
export type ScenarioAssetStore = z.infer<typeof ScenarioAssetStoreSchema>;

// Asset Metrics
export const AssetMetricsSchema = z.object({
  expert_corrections: z.number(),
  knowledge_nodes: z.number(),
  negative_results: z.number(),
});
export type AssetMetrics = z.infer<typeof AssetMetricsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Decision Output
// ─────────────────────────────────────────────────────────────────────────────

// CurrentRecommendation
export const CurrentRecommendationSchema = z.object({
  confidence: z.string(),
  headline: z.string(),
  summary: z.string(),
  next_action: z.string(),
});
export type CurrentRecommendation = z.infer<typeof CurrentRecommendationSchema>;

// DecisionOutput
export const DecisionOutputSchema = z.object({
  current_recommendation: CurrentRecommendationSchema,
  supporting_evidence: z.array(SignalSchema),
  opposing_evidence: z.array(SignalSchema),
  knowledge_status: z.array(SignalSchema),
  negative_paths: z.array(SignalSchema),
  expert_revised_judgment: z.array(SignalSchema),
});
export type DecisionOutput = z.infer<typeof DecisionOutputSchema>;

// ReasoningTrace
export const ReasoningTraceSchema = z.object({
  steps: z.array(TraceStepSchema),
  summary: z.object({
    score: z.string(),
    text: z.string(),
    highlights: z.array(SignalSchema),
  }),
});
export type ReasoningTrace = z.infer<typeof ReasoningTraceSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Scenario
// ─────────────────────────────────────────────────────────────────────────────

// ScenarioStatus
export const ScenarioStatusSchema = z.enum(["live", "watch", "risk"]);
export type ScenarioStatus = z.infer<typeof ScenarioStatusSchema>;

// Scenario - Complete scenario object
export const ScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: ScenarioStatusSchema,
  status_label: z.string(),
  one_liner: z.string(),
  tags: z.array(z.string()),
  overview: z.string(),
  positioning_quote: z.string(),
  suggested_query: z.string().optional(),
  hero_cards: z.array(z.object({ title: z.string(), text: z.string() })),
  last_updated: z.string(),
  data_agent: z.object({
    status: z.string(),
    object: DataObjectSchema,
    note: z.string(),
  }),
  model_agent: z.object({
    status: z.string(),
    object: ModelObjectSchema,
    note: z.string(),
  }),
  decision_output: DecisionOutputSchema,
  reasoning_trace: ReasoningTraceSchema,
  asset_store: ScenarioAssetStoreSchema,
});
export type Scenario = z.infer<typeof ScenarioSchema>;

// ScenarioMeta - Subset for bootstrap response
export const ScenarioMetaSchema = ScenarioSchema.pick({
  id: true,
  name: true,
  status: true,
  status_label: true,
  one_liner: true,
  tags: true,
});
export type ScenarioMeta = z.infer<typeof ScenarioMetaSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// API Request / Response Schemas
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/bootstrap
export const BootstrapResponseSchema = z.object({
  scenarios: z.array(ScenarioMetaSchema),
  schemas: z.object({
    data_object: z.object({ required: z.array(z.string()) }),
    model_object: z.object({ required: z.array(z.string()) }),
  }),
  asset_store: z.object({
    metrics: AssetMetricsSchema,
  }),
  default_scenario_id: z.string(),
  default_query: z.string(),
});
export type BootstrapResponse = z.infer<typeof BootstrapResponseSchema>;

// POST /api/run-analysis - Request
export const RunAnalysisRequestSchema = z.object({
  scenario_id: z.string(),
  query: z.string(),
  mode: z.enum(["precision", "breadth"]),
  priority: z.enum(["target-prioritization", "evidence-review"]),
});
export type RunAnalysisRequest = z.infer<typeof RunAnalysisRequestSchema>;

// POST /api/run-analysis - Response
export const RunAnalysisResponseSchema = z.object({
  asset_store: z.object({ metrics: AssetMetricsSchema }),
  scenario: ScenarioSchema,
});
export type RunAnalysisResponse = z.infer<typeof RunAnalysisResponseSchema>;

// POST /api/expert-correction - Request
export const ExpertCorrectionRequestSchema = z.object({
  scenario_id: z.string(),
  expert: z.string(),
  from: z.string(),
  to: z.string(),
  reason: z.string(),
});
export type ExpertCorrectionRequest = z.infer<typeof ExpertCorrectionRequestSchema>;

// POST /api/expert-correction - Response
export const ExpertCorrectionResponseSchema = z.object({
  asset_store: z.object({ metrics: AssetMetricsSchema }),
  scenario: ScenarioSchema,
});
export type ExpertCorrectionResponse = z.infer<typeof ExpertCorrectionResponseSchema>;