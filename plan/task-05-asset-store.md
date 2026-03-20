# Task 05 · 资产存储（Asset Store）

## 目标

实现三类可信科研资产的存储与管理：
1. **专家纠偏轨迹**（expert_corrections）
2. **知识节点**（knowledge_nodes）
3. **阴性结果库**（negative_results）

支持内存操作 + JSON 文件持久化，暴露统一接口供路由层和流水线调用。

---

## 设计原则

- 资产按 `scenario_id` 分区存储（每个场景独立资产池）
- 写操作立即持久化到文件
- 读操作从内存（启动时加载）
- 提供全局聚合指标（metrics），用于 topbar 数字展示

---

## 可实现路径

### 文件：`src/asset-store.ts`

```ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ExpertCorrection, KnowledgeNode, NegativeResult, ScenarioAssetStore } from "./schemas.js";

const DATA_DIR  = process.env.DATA_DIR ?? "./data";
const STORE_PATH = resolve(DATA_DIR, "asset-store.json");

// 内存存储结构
interface StoreShape {
  [scenarioId: string]: ScenarioAssetStore;
}

let store: StoreShape = {};

// ── 初始化 ─────────────────────────────────────────

export function loadStore(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(STORE_PATH)) {
    try {
      store = JSON.parse(readFileSync(STORE_PATH, "utf-8")) as StoreShape;
    } catch {
      store = {};
    }
  }
}

function saveStore(): void {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

// ── 场景级资产 ────────────────────────────────────

function ensureScenario(scenarioId: string): void {
  if (!store[scenarioId]) {
    store[scenarioId] = {
      expert_corrections: [],
      knowledge_nodes:    [],
      negative_results:   [],
    };
  }
}

export function getScenarioAssets(scenarioId: string): ScenarioAssetStore {
  ensureScenario(scenarioId);
  return store[scenarioId];
}

// ── 写入操作 ──────────────────────────────────────

export function addExpertCorrection(
  scenarioId: string,
  correction: Omit<ExpertCorrection, "timestamp">
): ExpertCorrection {
  ensureScenario(scenarioId);
  const item: ExpertCorrection = {
    ...correction,
    timestamp: new Date().toISOString(),
  };
  store[scenarioId].expert_corrections.push(item);
  saveStore();
  return item;
}

export function upsertKnowledgeNodes(
  scenarioId: string,
  nodes: KnowledgeNode[]
): void {
  ensureScenario(scenarioId);
  // 以 title 去重合并（新分析结果覆盖旧节点）
  const existing = new Map(store[scenarioId].knowledge_nodes.map((n) => [n.title, n]));
  for (const node of nodes) {
    existing.set(node.title, node);
  }
  store[scenarioId].knowledge_nodes = [...existing.values()];
  saveStore();
}

export function upsertNegativeResults(
  scenarioId: string,
  results: NegativeResult[]
): void {
  ensureScenario(scenarioId);
  const existing = new Map(store[scenarioId].negative_results.map((r) => [r.title, r]));
  for (const result of results) {
    existing.set(result.title, result);
  }
  store[scenarioId].negative_results = [...existing.values()];
  saveStore();
}

// ── 全局聚合指标 ──────────────────────────────────

export function getAssetMetrics(): { expert_corrections: number; knowledge_nodes: number; negative_results: number } {
  let corrections = 0;
  let knowledgeNodes = 0;
  let negativeResults = 0;
  for (const assets of Object.values(store)) {
    corrections    += assets.expert_corrections.length;
    knowledgeNodes  += assets.knowledge_nodes.length;
    negativeResults += assets.negative_results.length;
  }
  return {
    expert_corrections: corrections,
    knowledge_nodes:    knowledgeNodes,
    negative_results:   negativeResults,
  };
}
```

### 启动时加载

在 `src/server.ts` 顶部调用：

```ts
import { loadStore } from "./asset-store.js";
loadStore();
```

---

## 资产初始化数据

为了让 demo 首次运行时不显示空列表，在 `loadStore()` 中加入默认数据兜底：

```ts
// 如果某场景的资产为空，补充示例数据
const SEED: StoreShape = {
  "target-brca1": {
    expert_corrections: [
      { expert: "王磊 教授", from: "Cluster 7 = Tem", to: "Cluster 7 = Tpex",
        reason: "基于 TOX/TCF1 共表达判断为前驱耗竭亚群，非效应记忆", timestamp: "2024-11-01T09:00:00Z" }
    ],
    knowledge_nodes: [
      { title: "BRCA1 突变与 PARP 抑制剂敏感性", freshness: "2024", status: "confirmed" },
      { title: "TNBC 中 BRCA1 胚系突变率", freshness: "2023", status: "confirmed" },
    ],
    negative_results: [
      { title: "单用奥拉帕尼 vs. 铂类联合用药", effect: "联合组 PFS 未显示统计显著优势（OLYMPIA 亚组分析）" },
    ],
  },
};
```

---

## 验收标准

- `loadStore()` 在 `data/asset-store.json` 不存在时正常初始化
- `addExpertCorrection()` 写入后文件内容更新
- `getAssetMetrics()` 返回跨所有场景的聚合数字
- TypeScript 类型严格，无隐式 any
