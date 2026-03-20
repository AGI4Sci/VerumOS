# Task 07 · Model Agent

## 目标

实现 Model Agent：接收研究问题、Data Agent 的输出和场景上下文，调用 Claude 生成 `ModelObject`，包括分析协议版本、推理结论摘要、使用参数和排除路径。

---

## 职责边界

Model Agent 专注于**方法论和推理链**，不生成决策判断（那是 pipeline 层的职责）：
- 选择分析协议（如差异表达、GSEA、生存分析）
- 生成推理链摘要（`reasoning_trace`：一句话）
- 列出分析参数（`model_params`）
- 标注被明确排除的分析路径（`excluded_paths`）

---

## 可实现路径

### 文件：`src/agents/model-agent.ts`

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { DataObject, ModelObject } from "../schemas.js";

const client = new Anthropic();

interface ModelAgentInput {
  query:      string;
  context:    string;
  data:       DataObject;
  priority:   "target-prioritization" | "evidence-review";
}

interface ModelAgentResult {
  status: string;
  object: ModelObject;
  note:   string;
}

export async function runModelAgent(input: ModelAgentInput): Promise<ModelAgentResult> {
  const prompt = buildModelAgentPrompt(input);

  const message = await client.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 1024,
    system:     MODEL_AGENT_SYSTEM,
    messages:   [{ role: "user", content: prompt }],
  });

  const text = extractText(message);
  return parseModelAgentResponse(text);
}
```

### System Prompt

```ts
const MODEL_AGENT_SYSTEM = `\
你是一个生物医学分析方法代理（Model Agent）。
你的任务是：给定研究问题和数据基础，选择合适的分析协议并说明推理路径。

始终以 JSON 格式回复，结构如下：
{
  "status": "validated" | "provisional" | "uncertain",
  "object": {
    "protocol_version": "BioAgent-v0.1",
    "result": "核心分析结论（一到两句话）",
    "reasoning_trace": "推理链摘要（一句话）",
    "model_params": ["参数1: 值", "参数2: 值", ...],
    "excluded_paths": ["排除原因1", "排除原因2", ...]
  },
  "note": "对本次分析方法论的简短评注"
}

priority 说明：
- target-prioritization：聚焦靶点可成药性与临床转化可行性
- evidence-review：全面评估证据强度、重复性与争议点
`;
```

### User Prompt 构建

```ts
function buildModelAgentPrompt(input: ModelAgentInput): string {
  return `\
场景背景：
${input.context}

研究问题：
${input.query}

数据基础（Data Agent 输出）：
- 来源：${input.data.source}
- 质量：${input.data.quality_score}
- Ontology：${input.data.ontology_tags.join("、")}
- 处理历史：${input.data.processing_history.join(" → ")}

分析优先级：${input.priority}

请选择分析协议并说明：
1. 核心分析结论
2. 主要推理路径
3. 分析参数（如 FDR 阈值、最小样本量）
4. 明确排除的分析路径及原因`;
}
```

---

## 关于协议版本（`protocol_version`）

使用 `"BioAgent-v0.1"` 作为初始版本标识。后续可扩展为：
- `BioAgent-v0.1-precision`（精确模式）
- `BioAgent-v0.1-breadth`（广泛模式）

与 openclaw 的 `protocol_version` 约定（用于追踪兼容性）保持一致的命名风格。

---

## 错误处理

与 Data Agent 相同策略：
- JSON 解析失败 → fallback `ModelObject`（`status: "uncertain"`）
- 字段缺失 → Zod 校验报错

---

## 验收标准

- `runModelAgent(...)` 返回合法 `ModelAgentResult`
- `object.excluded_paths` 不为空（对推理过程可信度至关重要）
- 单元测试：mock LLM 调用，验证 prompt 中包含 `data.source` 和 `data.quality_score`
