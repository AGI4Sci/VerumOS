import OpenAI from "openai";
import type {
  DataObject,
  ModelObject,
  DecisionOutput,
  ReasoningTrace,
  Signal,
  TraceStep,
} from "../schemas.js";

// Initialize OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
});

export interface DecisionSynthesisInput {
  query: string;
  context: string;
  dataObject: DataObject;
  modelObject: ModelObject;
  keyPapers?: Array<{
    title: string;
    year: number;
    pmid?: string;
    key_finding: string;
  }>;
}

export interface DecisionSynthesisResult {
  decision_output: DecisionOutput;
  reasoning_trace: ReasoningTrace;
}

const DECISION_SYNTHESIS_SYSTEM = `你是一个生物医学决策综合代理（Decision Synthesis）。

你的任务是基于 Data Agent 和 Model Agent 提供的真实检索数据，综合生成可信的决策输出。

你必须以 JSON 格式输出，结构如下：
{
  "decision_output": {
    "current_recommendation": {
      "confidence": "High" | "Medium" | "Low",
      "headline": "一句话核心结论",
      "summary": "2-3句话详细说明",
      "next_action": "建议的下一步行动"
    },
    "supporting_evidence": [
      { "title": "证据标题", "meta": "来源/年份", "text": "详细说明" }
    ],
    "opposing_evidence": [
      { "title": "反对证据标题", "meta": "来源/年份", "text": "详细说明" }
    ],
    "knowledge_status": [
      { "title": "知识节点标题", "meta": "状态", "text": "说明" }
    ],
    "negative_paths": [
      { "title": "排除路径", "text": "排除原因" }
    ],
    "expert_revised_judgment": []
  },
  "reasoning_trace": {
    "steps": [
      {
        "title": "步骤标题",
        "label": "标签如 QC/文献/推理",
        "status": "done" | "active" | "warn",
        "text": "详细说明",
        "note": "可选备注"
      }
    ],
    "summary": {
      "score": "X.X / 10",
      "text": "综合评分说明",
      "highlights": [
        { "title": "亮点标题", "text": "说明" }
      ]
    }
  }
}

重要：
1. 所有证据必须基于提供的真实检索数据，不要编造
2. supporting_evidence 和 opposing_evidence 必须包含至少一条
3. reasoning_trace.steps 必须包含 3-5 个步骤
4. 如果存在争议或不确定性，在 knowledge_status 中标注`;

export async function runDecisionSynthesis(
  input: DecisionSynthesisInput
): Promise<DecisionSynthesisResult> {
  const model = process.env.LLM_MODEL ?? "glm-5";

  const userMsg = `研究问题：${input.query}

场景背景：
${input.context}

数据基础（Data Agent 输出）：
- 来源：${input.dataObject.source}
- 质量：${input.dataObject.quality_score}
- Ontology：${input.dataObject.ontology_tags.join("、")}
- 处理历史：${input.dataObject.processing_history.join(" → ")}

分析方法（Model Agent 输出）：
- 协议：${input.modelObject.protocol_version}
- 结论：${input.modelObject.result}
- 推理路径：${input.modelObject.reasoning_trace}
- 参数：${input.modelObject.model_params.join("、")}
- 排除路径：${input.modelObject.excluded_paths.join("、")}

${
  input.keyPapers?.length
    ? `关键文献：
${input.keyPapers
  .map(
    (p, i) =>
      `${i + 1}. ${p.title} (${p.year})${p.pmid ? ` PMID: ${p.pmid}` : ""} - ${p.key_finding}`
  )
  .join("\n")}`
    : ""
}

请综合以上信息，生成决策输出和推理轨迹。`;

  try {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: DECISION_SYNTHESIS_SYSTEM },
        { role: "user", content: userMsg },
      ],
    });

    const content = response.choices[0].message.content ?? "";
    return parseDecisionSynthesisResponse(content);
  } catch (err) {
    // Return fallback on error
    return getFallbackResult(input, String(err));
  }
}

function parseDecisionSynthesisResponse(text: string): DecisionSynthesisResult {
  // Extract JSON block
  const match = text.match(/\{[\s\S]+\}/);
  if (!match) {
    throw new Error("Decision Synthesis did not return valid JSON");
  }

  try {
    const parsed = JSON.parse(match[0]) as DecisionSynthesisResult;
    // Validate required fields
    if (!parsed.decision_output || !parsed.reasoning_trace) {
      throw new Error("Missing required fields");
    }
    return parsed;
  } catch (err) {
    throw new Error(`Failed to parse Decision Synthesis response: ${String(err)}`);
  }
}

function getFallbackResult(
  input: DecisionSynthesisInput,
  error: string
): DecisionSynthesisResult {
  return {
    decision_output: {
      current_recommendation: {
        confidence: "Low",
        headline: "分析过程中出现错误",
        summary: `在综合分析过程中发生错误: ${error}`,
        next_action: "请重试或检查输入参数",
      },
      supporting_evidence: [
        {
          title: "数据来源",
          text: input.dataObject.source,
        },
      ],
      opposing_evidence: [],
      knowledge_status: [
        {
          title: "分析状态",
          text: "需要重新分析",
        },
      ],
      negative_paths: input.modelObject.excluded_paths.map((p) => ({
        title: p,
        text: "基于分析方法排除",
      })),
      expert_revised_judgment: [],
    },
    reasoning_trace: {
      steps: [
        {
          title: "数据加载",
          label: "QC",
          status: "done",
          text: `已加载 ${input.dataObject.source}`,
        },
        {
          title: "分析方法选择",
          label: "推理",
          status: "done",
          text: input.modelObject.result,
        },
        {
          title: "决策综合",
          label: "推理",
          status: "warn",
          text: `错误: ${error}`,
        },
      ],
      summary: {
        score: "0.0 / 10",
        text: "分析失败",
        highlights: [],
      },
    },
  };
}