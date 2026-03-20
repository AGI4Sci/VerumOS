# Task 02 · 数据 Schema 定义

## 目标

用 Zod 定义所有数据对象的 schema，作为后端唯一的类型来源（Single Source of Truth），同时约束前端 API 的输入输出格式。

---

## 核心 Schema

### 2.1 DataObject（Data Agent 产出）

```ts
// 对应前端 dataAgent.object
export const DataObjectSchema = z.object({
  source:             z.string(),           // 数据来源，如 "PubMed · GSE141130"
  created_at:         z.string(),           // ISO 时间字符串
  quality_score:      z.string(),           // 如 "0.87 / 1.0"
  ontology_tags:      z.array(z.string()),  // ["BRCA1", "DNA Repair", "p53"]
  processing_history: z.array(z.string()),  // ["QC filter", "Normalization", ...]
});
```

### 2.2 ModelObject（Model Agent 产出）

```ts
// 对应前端 modelAgent.object
export const ModelObjectSchema = z.object({
  protocol_version: z.string(),            // 如 "BioAgent-v0.1"
  result:           z.string(),            // 分析结论摘要
  reasoning_trace:  z.string(),            // 推理链摘要（一句话）
  model_params:     z.array(z.string()),   // 分析参数列表
  excluded_paths:   z.array(z.string()),   // 排除路径（负例）
});
```

### 2.3 Signal（证据条目）

```ts
// 复用于 supporting_evidence / opposing_evidence / knowledge_status / negative_paths / expert_revised_judgment
export const SignalSchema = z.object({
  title: z.string(),
  meta:  z.string().optional(),
  text:  z.string(),
});
```

### 2.4 TraceStep（推理步骤）

```ts
export const TraceStepSchema = z.object({
  title:  z.string(),
  label:  z.string(),
  status: z.enum(["done", "active", "warn"]),
  text:   z.string(),
  note:   z.string().optional(),
});
```

### 2.5 ExpertCorrection（专家修正记录）

```ts
export const ExpertCorrectionSchema = z.object({
  expert:    z.string(),
  from:      z.string(),
  to:        z.string(),
  reason:    z.string(),
  timestamp: z.string(),  // ISO 时间字符串
});
```

### 2.6 KnowledgeNode（知识节点）

```ts
export const KnowledgeNodeSchema = z.object({
  title:     z.string(),
  freshness: z.string(),  // 如 "2024" 或 "3 months ago"
  status:    z.string(),  // 如 "confirmed" / "contested" / "updated"
});
```

### 2.7 NegativeResult（阴性结果）

```ts
export const NegativeResultSchema = z.object({
  title:  z.string(),
  effect: z.string(),  // 如 "无显著差异" / "未观测到靶点激活"
});
```

### 2.8 ScenarioAssetStore（场景级资产）

```ts
export const ScenarioAssetStoreSchema = z.object({
  expert_corrections: z.array(ExpertCorrectionSchema),
  knowledge_nodes:    z.array(KnowledgeNodeSchema),
  negative_results:   z.array(NegativeResultSchema),
});
```

### 2.9 DecisionOutput（决策输出）

```ts
export const DecisionOutputSchema = z.object({
  current_recommendation: z.object({
    confidence:  z.string(),   // 如 "High" / "Medium"
    headline:    z.string(),
    summary:     z.string(),
    next_action: z.string(),
  }),
  supporting_evidence:    z.array(SignalSchema),
  opposing_evidence:      z.array(SignalSchema),
  knowledge_status:       z.array(SignalSchema),
  negative_paths:         z.array(SignalSchema),
  expert_revised_judgment: z.array(SignalSchema),
});
```

### 2.10 ReasoningTrace

```ts
export const ReasoningTraceSchema = z.object({
  steps: z.array(TraceStepSchema),
  summary: z.object({
    score:      z.string(),     // 如 "8.2 / 10"
    text:       z.string(),
    highlights: z.array(SignalSchema),
  }),
});
```

### 2.11 Scenario（完整场景对象）

```ts
export const ScenarioSchema = z.object({
  id:                 z.string(),
  name:               z.string(),
  status:             z.enum(["live", "watch", "risk"]),
  status_label:       z.string(),
  one_liner:          z.string(),
  tags:               z.array(z.string()),
  overview:           z.string(),
  positioning_quote:  z.string(),
  suggested_query:    z.string().optional(),
  hero_cards:         z.array(z.object({ title: z.string(), text: z.string() })),
  last_updated:       z.string(),
  data_agent:         z.object({ status: z.string(), object: DataObjectSchema, note: z.string() }),
  model_agent:        z.object({ status: z.string(), object: ModelObjectSchema, note: z.string() }),
  decision_output:    DecisionOutputSchema,
  reasoning_trace:    ReasoningTraceSchema,
  asset_store:        ScenarioAssetStoreSchema,
});
```

---

## API Request / Response Schema

### `/api/bootstrap` → GET

```ts
export const BootstrapResponseSchema = z.object({
  scenarios:           z.array(ScenarioSchema.pick({ id:1, name:1, status:1, status_label:1, one_liner:1, tags:1 })),
  schemas: z.object({
    data_object:  z.object({ required: z.array(z.string()) }),
    model_object: z.object({ required: z.array(z.string()) }),
  }),
  asset_store: z.object({
    metrics: z.object({
      expert_corrections: z.number(),
      knowledge_nodes:    z.number(),
      negative_results:   z.number(),
    }),
  }),
  default_scenario_id: z.string(),
  default_query:       z.string(),
});
```

### `/api/run-analysis` → POST

```ts
export const RunAnalysisRequestSchema = z.object({
  scenario_id: z.string(),
  query:       z.string(),
  mode:        z.enum(["precision", "breadth"]),
  priority:    z.enum(["target-prioritization", "evidence-review"]),
});

export const RunAnalysisResponseSchema = z.object({
  asset_store: z.object({ metrics: AssetMetricsSchema }),
  scenario:    ScenarioSchema,
});
```

### `/api/expert-correction` → POST

```ts
export const ExpertCorrectionRequestSchema = z.object({
  scenario_id: z.string(),
  expert:      z.string(),
  from:        z.string(),
  to:          z.string(),
  reason:      z.string(),
});

export const ExpertCorrectionResponseSchema = z.object({
  asset_store: z.object({ metrics: AssetMetricsSchema }),
  scenario:    ScenarioSchema,
});
```

---

## 可实现路径

所有 schema 统一放在 `src/schemas.ts`，使用 `z.infer<typeof XxxSchema>` 导出 TypeScript 类型，避免重复类型声明。

```ts
// src/schemas.ts
export type DataObject     = z.infer<typeof DataObjectSchema>;
export type ModelObject    = z.infer<typeof ModelObjectSchema>;
export type Scenario       = z.infer<typeof ScenarioSchema>;
// ...
```

---

## 验收标准

- `src/schemas.ts` 可以被其他模块导入，类型推导正确
- 所有 schema 覆盖前端 `biomedical_agent_demo.html` 中的每一个 `escapeHtml()` 调用字段
- TypeScript 编译无报错
