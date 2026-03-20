# Task 08 · 分析流水线（真实数据库检索 + LLM 工具调用）

## 目标

用 Claude 的 **Tool Use（工具调用）** 模式实现真正的 Research Agent：
- Claude 自主决定调用哪些数据库工具
- 工具执行真实 API 请求（PubMed、Semantic Scholar、UniProt、STRING、ClinicalTrials）
- Claude 综合检索结果生成可信的决策输出

**区别于旧方案：** 旧方案是让 LLM 凭自身知识"生成"内容，新方案是 LLM **主动检索真实文献和知识库**后再综合分析。

---

## 架构图

```
runAnalysis(query, scenario)
  │
  ├─ Step 1: Data Agent（Tool Use 模式）
  │     Claude + 工具 → 自主调用 PubMed / Semantic Scholar
  │     → 得到真实文献摘要列表 → 生成 DataObject
  │
  ├─ Step 2: Model Agent（Tool Use 模式）
  │     Claude + 工具 → 自主调用 UniProt / STRING / ClinicalTrials
  │     → 得到基因/蛋白/临床数据 → 生成 ModelObject + 排除路径
  │
  ├─ Step 3: Decision Synthesis（单次 LLM 调用，无工具）
  │     Claude 基于 Step1+Step2 的真实检索结果做综合判断
  │     → 生成 DecisionOutput + ReasoningTrace
  │
  ├─ Step 4: Asset Store 更新
  │     knowledge_nodes + negative_results 写入持久化
  │
  └─ Step 5: 组装 Scenario 返回
```

---

## 工具定义（Tool Registry）

### 文件：`src/tools/registry.ts`

```ts
import type { Tool } from "@anthropic-ai/sdk/resources/messages.js";

export const BIO_TOOLS: Tool[] = [
  {
    name: "search_pubmed",
    description:
      "Search PubMed for biomedical literature. Returns paper titles, abstracts, authors, and publication dates. Use this to find evidence for or against a hypothesis.",
    input_schema: {
      type: "object",
      properties: {
        query:       { type: "string",  description: "PubMed search query (supports MeSH terms and Boolean operators)" },
        max_results: { type: "integer", description: "Number of results to return (default: 5, max: 10)" },
        since_year:  { type: "integer", description: "Filter papers published from this year onwards (optional)" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_semantic_scholar",
    description:
      "Search Semantic Scholar for papers with citation counts and influence scores. Best for assessing evidence strength and finding highly-cited studies.",
    input_schema: {
      type: "object",
      properties: {
        query:       { type: "string",  description: "Search query" },
        max_results: { type: "integer", description: "Number of results (default: 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_gene_info",
    description:
      "Get detailed gene information from NCBI Gene database, including function, pathways, associated diseases, and expression data.",
    input_schema: {
      type: "object",
      properties: {
        gene_symbol: { type: "string", description: "Official gene symbol, e.g. BRCA1, TP53, EGFR" },
        species:     { type: "string", description: "Species (default: 'human')" },
      },
      required: ["gene_symbol"],
    },
  },
  {
    name: "get_protein_interactions",
    description:
      "Query STRING database for protein-protein interaction network. Returns interacting partners and confidence scores.",
    input_schema: {
      type: "object",
      properties: {
        gene_symbol:       { type: "string",  description: "Gene/protein symbol" },
        min_score:         { type: "integer", description: "Minimum interaction score 0-1000 (default: 400)" },
        max_interactions:  { type: "integer", description: "Max number of interactions to return (default: 10)" },
      },
      required: ["gene_symbol"],
    },
  },
  {
    name: "search_clinical_trials",
    description:
      "Search ClinicalTrials.gov for relevant clinical studies. Returns trial status, phase, and key findings.",
    input_schema: {
      type: "object",
      properties: {
        condition:    { type: "string", description: "Disease or condition (e.g. 'breast cancer')" },
        intervention: { type: "string", description: "Drug, treatment, or intervention (optional)" },
        status:       { type: "string", enum: ["RECRUITING", "COMPLETED", "ALL"], description: "Trial status filter" },
        max_results:  { type: "integer", description: "Max trials to return (default: 5)" },
      },
      required: ["condition"],
    },
  },
];
```

---

## 工具执行实现

### 文件：`src/tools/executor.ts`

```ts
import type { ToolUseBlock } from "@anthropic-ai/sdk/resources/messages.js";

export async function executeTool(tool: ToolUseBlock): Promise<string> {
  switch (tool.name) {
    case "search_pubmed":           return searchPubMed(tool.input as PubMedInput);
    case "search_semantic_scholar": return searchSemanticScholar(tool.input as SemanticScholarInput);
    case "get_gene_info":           return getGeneInfo(tool.input as GeneInfoInput);
    case "get_protein_interactions":return getProteinInteractions(tool.input as ProteinInteractionsInput);
    case "search_clinical_trials":  return searchClinicalTrials(tool.input as ClinicalTrialsInput);
    default: throw new Error(`Unknown tool: ${tool.name}`);
  }
}
```

#### PubMed（NCBI E-utilities，免费，无需 API Key）

```ts
async function searchPubMed(input: PubMedInput): Promise<string> {
  const maxResults = Math.min(input.max_results ?? 5, 10);
  // Step 1: esearch → 获取 PMID 列表
  const searchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  searchUrl.searchParams.set("db", "pubmed");
  searchUrl.searchParams.set("term", input.query);
  searchUrl.searchParams.set("retmax", String(maxResults));
  searchUrl.searchParams.set("retmode", "json");
  if (input.since_year) {
    searchUrl.searchParams.set("mindate", `${input.since_year}/01/01`);
    searchUrl.searchParams.set("datetype", "pdat");
  }

  const searchRes = await fetch(searchUrl).then((r) => r.json());
  const ids: string[] = searchRes.esearchresult?.idlist ?? [];
  if (!ids.length) return "No results found.";

  // Step 2: efetch → 获取摘要
  const fetchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi");
  fetchUrl.searchParams.set("db", "pubmed");
  fetchUrl.searchParams.set("id", ids.join(","));
  fetchUrl.searchParams.set("rettype", "abstract");
  fetchUrl.searchParams.set("retmode", "text");

  const text = await fetch(fetchUrl).then((r) => r.text());
  return text.slice(0, 8000); // 限制返回长度
}
```

#### Semantic Scholar（免费公开 API）

```ts
async function searchSemanticScholar(input: SemanticScholarInput): Promise<string> {
  const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
  url.searchParams.set("query", input.query);
  url.searchParams.set("limit", String(input.max_results ?? 5));
  url.searchParams.set("fields", "title,abstract,year,citationCount,authors,externalIds");

  const data = await fetch(url, {
    headers: { "User-Agent": "BioAgent/0.1 (research tool)" }
  }).then((r) => r.json());

  return JSON.stringify(data.data ?? [], null, 2).slice(0, 6000);
}
```

#### NCBI Gene（免费）

```ts
async function getGeneInfo(input: GeneInfoInput): Promise<string> {
  const species = input.species ?? "human";
  const searchTerm = `${input.gene_symbol}[Gene Name] AND ${species}[Organism] AND alive[prop]`;
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gene&term=${encodeURIComponent(searchTerm)}&retmode=json&retmax=1`;
  const searchData = await fetch(searchUrl).then((r) => r.json());
  const geneId = searchData.esearchresult?.idlist?.[0];
  if (!geneId) return `Gene ${input.gene_symbol} not found.`;

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=${geneId}&retmode=json`;
  const summaryData = await fetch(summaryUrl).then((r) => r.json());
  const gene = summaryData.result?.[geneId];
  return JSON.stringify({
    name:        gene?.name,
    description: gene?.description,
    chromosome:  gene?.chromosome,
    summary:     gene?.summary?.slice(0, 1000),
    mim:         gene?.mim,
  }, null, 2);
}
```

#### STRING DB（免费）

```ts
async function getProteinInteractions(input: ProteinInteractionsInput): Promise<string> {
  const url = new URL("https://string-db.org/api/json/interaction_partners");
  url.searchParams.set("identifier", input.gene_symbol);
  url.searchParams.set("species", "9606");  // human
  url.searchParams.set("limit", String(input.max_interactions ?? 10));
  url.searchParams.set("required_score", String(input.min_score ?? 400));

  const data = await fetch(url).then((r) => r.json());
  return JSON.stringify((data as any[]).map((d) => ({
    partner:     d.preferredName_B,
    score:       d.score,
    textmining:  d.textmining,
    experiments: d.experiments,
    coexpression: d.coexpression,
  })), null, 2).slice(0, 4000);
}
```

#### ClinicalTrials.gov（v2 API，免费）

```ts
async function searchClinicalTrials(input: ClinicalTrialsInput): Promise<string> {
  const url = new URL("https://clinicaltrials.gov/api/v2/studies");
  url.searchParams.set("query.cond",   input.condition);
  if (input.intervention) url.searchParams.set("query.intr", input.intervention);
  if (input.status && input.status !== "ALL")
    url.searchParams.set("filter.overallStatus", input.status);
  url.searchParams.set("pageSize", String(input.max_results ?? 5));
  url.searchParams.set("fields", "NCTId,BriefTitle,OverallStatus,Phase,BriefSummary,StartDate,CompletionDate");

  const data = await fetch(url).then((r) => r.json());
  return JSON.stringify(data.studies ?? [], null, 2).slice(0, 5000);
}
```

---

## Tool Use 循环（Agentic Loop）

### 文件：`src/tools/agentic-loop.ts`

```ts
import Anthropic from "@anthropic-ai/sdk";
import { executeTool } from "./executor.js";
import type { Tool } from "@anthropic-ai/sdk/resources/messages.js";

const client = new Anthropic();
const MAX_TOOL_ROUNDS = 8;  // 防止无限循环

export async function runAgenticLoop(params: {
  system:   string;
  userMsg:  string;
  tools:    Tool[];
  model?:   string;
}): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: params.userMsg }
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model:      params.model ?? "claude-sonnet-4-6",
      max_tokens: 4096,
      system:     params.system,
      tools:      params.tools,
      messages,
    });

    // 收集本轮所有内容块
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      // 提取最终文字输出
      return response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("\n");
    }

    if (response.stop_reason === "tool_use") {
      // 并发执行所有工具调用
      const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          try {
            const result = await executeTool(block);
            return {
              type:        "tool_result" as const,
              tool_use_id: block.id,
              content:     result,
            };
          } catch (err) {
            return {
              type:        "tool_result" as const,
              tool_use_id: block.id,
              content:     `Error: ${String(err)}`,
              is_error:    true,
            };
          }
        })
      );
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    break;
  }

  throw new Error("Agentic loop reached max rounds without end_turn");
}
```

---

## 重写 Data Agent

```ts
// src/agents/data-agent.ts
const DATA_AGENT_SYSTEM = `\
你是一个生物医学数据基础评估代理（Data Agent）。

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
}`;

export async function runDataAgent(input: DataAgentInput): Promise<DataAgentResult> {
  const result = await runAgenticLoop({
    system:  DATA_AGENT_SYSTEM,
    userMsg: `场景背景：\n${input.context}\n\n研究问题：\n${input.query}\n\n分析模式：${input.mode}`,
    tools:   [BIO_TOOLS[0], BIO_TOOLS[1]],  // search_pubmed + search_semantic_scholar
  });
  return parseDataAgentResponse(result);
}
```

---

## 重写 Model Agent

```ts
// src/agents/model-agent.ts
const MODEL_AGENT_SYSTEM = `\
你是一个生物医学分析方法代理（Model Agent）。

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
}`;

export async function runModelAgent(input: ModelAgentInput): Promise<ModelAgentResult> {
  // 从 DataObject 中提取基因名用于工具查询
  const geneHint = input.data.ontology_tags[0] ?? "";
  const result = await runAgenticLoop({
    system:  MODEL_AGENT_SYSTEM,
    userMsg: `研究问题：${input.query}\n核心靶点：${geneHint}\n数据质量：${input.data.quality_score}\n分析优先级：${input.priority}`,
    tools:   [BIO_TOOLS[2], BIO_TOOLS[3], BIO_TOOLS[4]], // gene_info + interactions + clinical_trials
  });
  return parseModelAgentResponse(result);
}
```

---

## Decision Synthesis（无工具，纯综合）

第三步不再需要工具——前两步已经收集了真实数据，第三步只负责综合判断：

```ts
// src/agents/decision-synthesis.ts
// 系统提示强调：你拥有上述真实检索数据，请基于这些证据做出可信判断
// 输出格式与原 task-08 方案相同（DecisionOutput + ReasoningTrace）
// 不再需要"生成"知识，而是"综合"已有证据
```

---

## 性能预期与速率限制处理

| 数据源 | 速率限制 | 策略 |
|--------|----------|------|
| NCBI E-utilities | 3 req/s（无 key）/ 10 req/s（有 key） | 添加 `NCBI_API_KEY` 可选配置 |
| Semantic Scholar | 1 req/s（无 key）/ 100 req/s（有 key） | 添加 `SEMANTIC_SCHOLAR_API_KEY` 可选配置 |
| STRING DB | 无明确限制 | 并发安全 |
| ClinicalTrials.gov v2 | 无明确限制 | 并发安全 |

工具调用采用并发执行（`Promise.all`），同一 round 的多个工具同时发出请求。
端到端典型耗时：**20-40 秒**（3 个 LLM + 多次 API 调用），可在前端展示进度。

---

## 验收标准

- `POST /api/run-analysis` 返回的 `decision_output.supporting_evidence` 中包含真实 PMID 或论文标题
- `data_agent.object.source` 包含实际检索到的文献数量（如 `"PubMed (8 papers) · Semantic Scholar (5 papers)"`）
- `model_agent.object.excluded_paths` 基于真实数据库证据，而非 LLM 凭空生成
- 网络不可用时有错误降级（返回明确的 503 而非静默失败）
