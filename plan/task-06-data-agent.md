# Task 06 · Data Agent

## 目标

实现 Data Agent：接收研究问题（query）和场景上下文，调用 Claude 生成 `DataObject`，包括数据来源、质量评分、Ontology 标签和处理历史。

---

## 职责边界

| 职责 | Data Agent | Model Agent（Task 07） |
|------|------------|----------------------|
| 数据来源评估 | ✅ | - |
| 质量评分 | ✅ | - |
| Ontology 标签 | ✅ | - |
| 分析推理 | - | ✅ |
| 结论与证据链 | - | ✅ |

---

## 可实现路径

### 文件：`src/agents/data-agent.ts`

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { DataObject } from "../schemas.js";

const client = new Anthropic();

interface DataAgentInput {
  query:   string;
  context: string;   // 场景背景（来自 ScenarioConfig.context）
  mode:    "precision" | "breadth";
}

interface DataAgentResult {
  status: string;
  object: DataObject;
  note:   string;
}

export async function runDataAgent(input: DataAgentInput): Promise<DataAgentResult> {
  const prompt = buildDataAgentPrompt(input);

  const message = await client.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 1024,
    system:     DATA_AGENT_SYSTEM,
    messages:   [{ role: "user", content: prompt }],
  });

  const text = extractText(message);
  const parsed = parseDataAgentResponse(text);
  return parsed;
}
```

### System Prompt

```ts
const DATA_AGENT_SYSTEM = `\
你是一个生物医学数据质量评估代理（Data Agent）。
你的任务是：给定一个科研问题，评估相关的数据来源、质量和本体标签。

始终以 JSON 格式回复，结构如下：
{
  "status": "ready" | "partial" | "insufficient",
  "object": {
    "source": "主要数据库和数据集，如 PubMed · GSE141130",
    "created_at": "YYYY-MM-DD",
    "quality_score": "0.XX / 1.0",
    "ontology_tags": ["基因/蛋白/通路名称列表"],
    "processing_history": ["步骤1", "步骤2", ...]
  },
  "note": "一句话说明数据质量状态或注意事项"
}

根据 mode 调整深度：precision = 精确聚焦核心证据；breadth = 广泛覆盖相关领域。
`;
```

### User Prompt 构建

```ts
function buildDataAgentPrompt(input: DataAgentInput): string {
  return `\
场景背景：
${input.context}

研究问题：
${input.query}

分析模式：${input.mode}

请评估此问题的数据基础，包括：
1. 主要相关数据库和公开数据集
2. 数据质量评分（基于样本量、来源可信度、时效性）
3. 关键 Ontology 标签（基因、蛋白、通路、疾病）
4. 典型数据处理流程`;
}
```

### 响应解析

```ts
function parseDataAgentResponse(text: string): DataAgentResult {
  // 提取 JSON 块（Claude 可能在 JSON 前后加说明文字）
  const match = text.match(/\{[\s\S]+\}/);
  if (!match) throw new Error("Data Agent 未返回有效 JSON");
  return JSON.parse(match[0]) as DataAgentResult;
}

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => (block as Anthropic.TextBlock).text)
    .join("\n");
}
```

---

## 错误处理策略

- LLM 调用失败（网络/API 错误）：抛出异常，由 pipeline 层捕获并返回 500
- JSON 解析失败：返回 fallback DataObject（以 `status: "insufficient"` 标记）
- 字段缺失：用 Zod `.parse()` 校验，缺失字段报错

---

## 验收标准

- `runDataAgent({ query: "...", context: "...", mode: "precision" })` 返回合法 `DataAgentResult`
- 返回的 `object` 字段满足 `DataObjectSchema`（用 `DataObjectSchema.parse()` 验证）
- 单元测试：mock `Anthropic.messages.create`，验证 prompt 构建和响应解析逻辑
