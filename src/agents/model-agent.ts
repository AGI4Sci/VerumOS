import { runAgenticLoop } from "../tools/agentic-loop.js";
import { BIO_TOOLS } from "../tools/registry.js";
import type { DataObject, ModelObject } from "../schemas.js";

export interface ModelAgentInput {
  query: string;
  context: string;
  data: DataObject;
  priority: "target-prioritization" | "evidence-review";
}

export interface ModelAgentResult {
  status: string;
  object: ModelObject;
  note: string;
  database_evidence?: {
    gene_function?: string;
    key_interactions?: string[];
    clinical_stage?: string;
  };
}

const MODEL_AGENT_SYSTEM = `你是一个生物医学分析方法代理（Model Agent）。

你有权调用 get_gene_info、get_protein_interactions、search_clinical_trials 工具。
请主动检索靶基因的分子功能和临床进展，用真实数据支撑分析方法选择。

完成检索后，以 JSON 格式输出：
{
  "status": "validated" | "provisional" | "uncertain",
  "object": {
    "protocol_version": "BioAgent-v0.1",
    "result": "基于检索数据的核心分析结论",
    "reasoning_trace": "推理路径摘要（引用具体数据）",
    "model_params": ["基于真实数据确定的分析参数"],
    "excluded_paths": ["基于检索证据排除的路径及原因"]
  },
  "note": "分析方法论的评注",
  "database_evidence": {
    "gene_function": "来自 NCBI Gene 的功能描述",
    "key_interactions": ["TOP3 互作蛋白及置信分数"],
    "clinical_stage": "临床进展阶段"
  }
}

重要：
1. 必须调用工具检索真实数据，不要凭空捏造
2. 返回的 JSON 必须是有效格式
3. excluded_paths 必须包含至少一个排除路径

priority 说明：
- target-prioritization：聚焦靶点可成药性与临床转化可行性
- evidence-review：全面评估证据强度、重复性与争议点`;

export async function runModelAgent(input: ModelAgentInput): Promise<ModelAgentResult> {
  // Extract gene name from ontology tags for tool queries
  const geneHint = input.data.ontology_tags[0] ?? "";

  const userMsg = `研究问题：${input.query}
核心靶点：${geneHint}
数据质量：${input.data.quality_score}
数据来源：${input.data.source}
分析优先级：${input.priority}

请检索相关基因/蛋白/临床数据并选择分析方法。`;

  try {
    const result = await runAgenticLoop({
      system: MODEL_AGENT_SYSTEM,
      userMsg,
      tools: [BIO_TOOLS[2], BIO_TOOLS[3], BIO_TOOLS[4]], // gene_info + interactions + clinical_trials
    });

    return parseModelAgentResponse(result);
  } catch (err) {
    // Fallback on error
    return {
      status: "uncertain",
      object: {
        protocol_version: "BioAgent-v0.1",
        result: "分析失败，无法生成结论",
        reasoning_trace: `Error: ${String(err)}`,
        model_params: [],
        excluded_paths: ["检索失败，无法确定排除路径"],
      },
      note: `模型分析失败: ${String(err)}`,
    };
  }
}

function parseModelAgentResponse(text: string): ModelAgentResult {
  // Extract JSON block
  const match = text.match(/\{[\s\S]+\}/);
  if (!match) {
    throw new Error("Model Agent did not return valid JSON");
  }

  try {
    const parsed = JSON.parse(match[0]) as ModelAgentResult;
    // Validate required fields
    if (!parsed.object || !parsed.status) {
      throw new Error("Missing required fields");
    }
    return parsed;
  } catch (err) {
    throw new Error(`Failed to parse Model Agent response: ${String(err)}`);
  }
}