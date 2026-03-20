# Task 09 · 专家修正写回

## 目标

实现 `POST /api/expert-correction` 接口：接收专家的修正意见，写入 Asset Store，并将修正内容映射到当前场景的 `decision_output.expert_revised_judgment`，实时更新前端展示。

---

## 业务逻辑

```
收到修正请求 { scenario_id, expert, from, to, reason }
  │
  ├─ 1. 校验字段（由 Hono zValidator 处理）
  │
  ├─ 2. addExpertCorrection() → 写入 asset-store.json
  │
  ├─ 3. 重建最新 Scenario 状态
  │     从 asset store 读取完整修正列表
  │     映射为 expert_revised_judgment（Signal 格式）
  │
  └─ 4. 返回 { asset_store: { metrics }, scenario }
```

---

## 关键设计决策

**是否重新调用 LLM？**

不需要。专家修正是**确定性操作**，不需要重新生成分析。
只需要：
1. 把新修正存入 asset store
2. 把 asset store 中的所有修正映射成 `Signal[]` 格式
3. 把上次分析的 scenario 状态（缓存在内存中）的 `expert_revised_judgment` 字段替换

**Scenario 状态缓存**

pipeline 每次分析后，将结果缓存在内存（`Map<scenarioId, Scenario>`）。
专家修正时从缓存取出，只更新 `expert_revised_judgment` 和 `asset_store` 字段，其余字段不变。

---

## 可实现路径

### 文件：`src/scenario-cache.ts`（新增）

```ts
import type { Scenario } from "./schemas.js";

// 每个 scenario_id 只保存最近一次分析结果
const cache = new Map<string, Scenario>();

export function cacheScenario(scenario: Scenario): void {
  cache.set(scenario.id, scenario);
}

export function getCachedScenario(scenarioId: string): Scenario | undefined {
  return cache.get(scenarioId);
}
```

在 `pipeline.ts` 的 `runAnalysis()` 末尾调用 `cacheScenario(scenario)`。

### 修正到 Signal 的映射

```ts
function correctionToSignal(c: ExpertCorrection): Signal {
  return {
    title: `${c.expert} 修正`,
    meta:  c.timestamp.slice(0, 10),   // YYYY-MM-DD
    text:  `原判断：${c.from} → 修正为：${c.to}。理由：${c.reason}`,
  };
}
```

### 路由处理器：`src/routes/expert-correction.ts`

```ts
import { addExpertCorrection, getScenarioAssets, getAssetMetrics } from "../asset-store.js";
import { getCachedScenario, cacheScenario } from "../scenario-cache.js";
import type { Handler } from "hono";

export const handleExpertCorrection: Handler = async (c) => {
  const { scenario_id, expert, from, to, reason } = c.req.valid("json");

  // 1. 写入 asset store
  addExpertCorrection(scenario_id, { expert, from, to, reason });

  // 2. 获取缓存场景
  const cached = getCachedScenario(scenario_id);
  if (!cached) {
    return c.json({ error: "请先运行一次分析再提交专家修正" }, 400);
  }

  // 3. 重建 expert_revised_judgment
  const assets = getScenarioAssets(scenario_id);
  const expertSignals = assets.expert_corrections.map(correctionToSignal);

  // 4. 更新场景
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

  return c.json({
    asset_store: { metrics: getAssetMetrics() },
    scenario:    updated,
  });
};
```

---

## 边界情况处理

| 情况 | 处理方式 |
|------|----------|
| 场景不存在（未分析过） | 返回 400 + 提示信息 |
| 字段缺失 | Zod 校验层拦截，返回 400 |
| 重复修正（same from/to） | 允许重复，追加到列表 |
| 服务重启后缓存丢失 | 提示用户重新运行分析（Stage 1 可接受，后续可持久化 cache） |

---

## 前端联动验证

提交修正后，前端会：
1. 更新 topbar 的"专家纠偏"计数
2. 在右侧 correction-log 显示新记录
3. 在"专家修正版判断"卡片中显示新的 Signal 条目
4. 在"专家纠偏轨迹"Asset 卡片中显示新条目

所有这些都依赖返回的 `scenario.asset_store.expert_corrections[]` 和 `scenario.decision_output.expert_revised_judgment[]`，本实现均已覆盖。

---

## 验收标准

- `POST /api/expert-correction` 成功写入后，再次 `POST /api/run-analysis` 时专家修正仍保留在 asset store
- 服务不重启时，连续提交两条修正，前端 correction-log 显示两条
- 专家修正内容正确出现在 `decision_output.expert_revised_judgment`
- 提交时未运行过分析，返回可读的 400 错误消息
