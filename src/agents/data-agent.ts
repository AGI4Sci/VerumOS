import { runAgenticLoop } from "../tools/agentic-loop.js";
import { BIO_TOOLS } from "../tools/registry.js";
import type { DataObject } from "../schemas.js";

export interface DataAgentInput {
  query: string;
  context: string;
  mode: "precision" | "breadth";
}

export interface DataAgentResult {
  status: string;
  object: DataObject;
  note: string;
  key_papers?: Array<{
    title: string;
    year: number;
    pmid?: string;
    key_finding: string;
  }>;
}

const DATA_AGENT_SYSTEM = `你是一个生物医学数据基础评估代理（Data Agent）。

你有权调用 search_pubmed 和 search_semantic_scholar 工具检索真实文献。
请主动搜索与研究问题直接相关的文献，确保证据来自真实发表的论文。

完成检索后，以 JSON 格式输出：
{
  "status": "ready" | "partial" | "insufficient",
  "object": {
    "source": "检索到的主要数据库，如 PubMed (N papers) · Semantic Scholar (N papers)",
    "created_at": "YYYY-MM-DD",
    "quality_score": "0.XX / 1.0 （基于文献数量、引用量和发表年限综合评估）",
    "ontology_tags": ["从文献中提取的关键基因/蛋白/通路/疾病术语"],
    "processing_history": ["PubMed 检索: N条结果", "Semantic Scholar 检索: N条结果", "质量筛选", ...]
  },
  "note": "对数据基础质量的简短评注",
  "key_papers": [
    { "title": "...", "year": 2024, "pmid": "...", "key_finding": "一句话摘要" }
  ]
}

重要：
1. 必须调用工具检索真实文献，不要凭空捏造
2. 返回的 JSON 必须是有效格式
3. 如果检索不到结果，status 设为 "insufficient"`;

export async function runDataAgent(input: DataAgentInput): Promise<DataAgentResult> {
  const userMsg = `场景背景：
${input.context}

研究问题：
${input.query}

分析模式：${input.mode}

请检索相关文献并评估数据基础。`;

  try {
    const result = await runAgenticLoop({
      system: DATA_AGENT_SYSTEM,
      userMsg,
      tools: [BIO_TOOLS[0], BIO_TOOLS[1]], // search_pubmed + search_semantic_scholar
    });

    return parseDataAgentResponse(result);
  } catch (err) {
    // Fallback on error
    return {
      status: "insufficient",
      object: {
        source: "检索失败",
        created_at: new Date().toISOString().slice(0, 10),
        quality_score: "0.00 / 1.0",
        ontology_tags: [],
        processing_history: [`Error: ${String(err)}`],
      },
      note: `数据检索失败: ${String(err)}`,
    };
  }
}

function parseDataAgentResponse(text: string): DataAgentResult {
  // Extract JSON block
  const match = text.match(/\{[\s\S]+\}/);
  if (!match) {
    throw new Error("Data Agent did not return valid JSON");
  }

  try {
    const parsed = JSON.parse(match[0]) as DataAgentResult;
    // Validate required fields
    if (!parsed.object || !parsed.status) {
      throw new Error("Missing required fields");
    }
    return parsed;
  } catch (err) {
    throw new Error(`Failed to parse Data Agent response: ${String(err)}`);
  }
}