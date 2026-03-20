# Task 04 · 场景注册表

## 目标

定义 3 个内置生物医学研究场景（Scenario），每个场景包含静态元数据，作为 `GET /api/bootstrap` 中 `scenarios[]` 的数据来源，也作为分析流水线的初始上下文。

---

## 设计原则

- 场景是**静态配置**，不依赖 LLM 生成，保证 bootstrap 接口快速响应
- 每个场景携带足够的元数据，帮助 LLM 在分析时理解研究背景
- 场景 `default_query` 作为前端默认问题，用户可以修改

---

## 三个内置场景

### 场景 1：`target-brca1`

```ts
{
  id: "target-brca1",
  name: "BRCA1 靶点优先级评估",
  status: "live",
  status_label: "Active",
  one_liner: "评估 BRCA1 通路在三阴性乳腺癌中的干预优先级与证据质量",
  tags: ["BRCA1", "乳腺癌", "DNA修复", "PARP抑制剂"],
  default_query: "BRCA1 在三阴性乳腺癌中的靶向治疗优先级如何？现有证据链的可信度？",
  context: "三阴性乳腺癌（TNBC）缺乏 ER/PR/HER2 靶点，BRCA1 突变频率约 15-20%，PARP 抑制剂已进入临床..."
}
```

### 场景 2：`pathway-pi3k`

```ts
{
  id: "pathway-pi3k",
  name: "PI3K/AKT 通路信号分析",
  status: "watch",
  status_label: "Under Review",
  one_liner: "分析 PI3K/AKT/mTOR 轴在耐药机制中的作用，识别可干预节点",
  tags: ["PI3K", "AKT", "mTOR", "耐药"],
  default_query: "PI3K/AKT 通路在 CDK4/6 抑制剂耐药中的作用机制与干预窗口？",
  context: "PI3K/AKT/mTOR 轴是乳腺癌最常见激活通路之一，在 CDK4/6 抑制剂耐药后常出现 PIK3CA 突变..."
}
```

### 场景 3：`scrna-tumor-micro`

```ts
{
  id: "scrna-tumor-micro",
  name: "单细胞 RNA 肿瘤微环境解析",
  status: "watch",
  status_label: "In Progress",
  one_liner: "基于 scRNA-seq 数据解析肿瘤微环境细胞组成，聚焦 T 细胞亚群功能状态",
  tags: ["scRNA-seq", "肿瘤微环境", "T细胞", "exhaustion"],
  default_query: "如何从 scRNA-seq 数据中准确识别 Tpex 细胞亚群？与耗竭型 T 细胞的分子边界？",
  context: "肿瘤浸润淋巴细胞（TIL）的功能状态直接影响免疫治疗响应，Tpex（precursor exhausted T cells）..."
}
```

---

## 可实现路径

### 文件：`src/scenarios.ts`

```ts
import type { ScenarioMeta } from "./schemas.js";

// ScenarioMeta 是 ScenarioSchema 的 pick 子集（id/name/status/status_label/one_liner/tags）
// 加上 default_query 和 context（context 仅用于 LLM prompt，不返回前端）

export interface ScenarioConfig {
  meta:          ScenarioMeta;
  default_query: string;
  context:       string;   // 背景信息，注入 LLM system prompt
}

export const SCENARIOS: ScenarioConfig[] = [
  { meta: { id: "target-brca1", ... }, default_query: "...", context: "..." },
  { meta: { id: "pathway-pi3k", ... }, default_query: "...", context: "..." },
  { meta: { id: "scrna-tumor-micro", ... }, default_query: "...", context: "..." },
];

export function getScenario(id: string): ScenarioConfig | undefined {
  return SCENARIOS.find((s) => s.meta.id === id);
}

export const DEFAULT_SCENARIO_ID = SCENARIOS[0].meta.id;
```

### `GET /api/bootstrap` 中的使用

```ts
// routes/bootstrap.ts
import { SCENARIOS, DEFAULT_SCENARIO_ID } from "../scenarios.js";
import { getAssetMetrics } from "../asset-store.js";

export const handleBootstrap: Handler = (c) => {
  return c.json({
    scenarios: SCENARIOS.map((s) => s.meta),
    schemas: {
      data_object:  { required: ["source", "created_at", "quality_score", "ontology_tags", "processing_history"] },
      model_object: { required: ["protocol_version", "result", "reasoning_trace", "model_params", "excluded_paths"] },
    },
    asset_store:         { metrics: getAssetMetrics() },
    default_scenario_id: DEFAULT_SCENARIO_ID,
    default_query:       SCENARIOS.find((s) => s.meta.id === DEFAULT_SCENARIO_ID)!.default_query,
  });
};
```

---

## 验收标准

- `GET /api/bootstrap` 返回包含 3 个场景的列表
- 每个场景包含前端需要的所有 meta 字段
- `getScenario("target-brca1")` 可以正确返回场景数据
