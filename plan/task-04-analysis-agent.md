# Task 04 · Analysis Agent 实现

## 目标

实现 Analysis Agent，帮助用户调用工具、分析结果、生成报告。

---

## 核心功能

### 4.1 工具调用

```typescript
// 调用外部工具和数据库
interface ToolCall {
  tool: string;        // "pubmed", "string", "blast", ...
  action: string;      // "search", "query", "align", ...
  params: Record<string, any>;
}

async function callTool(call: ToolCall): Promise<ToolResult> {
  const skill = skillRegistry.getSkill(call.tool);
  if (!skill) {
    throw new Error(`Tool not found: ${call.tool}`);
  }
  
  return skill.execute(call.action, call.params);
}
```

### 4.2 分析流程编排

```typescript
// 定义分析流程
interface AnalysisPipeline {
  steps: AnalysisStep[];
  dependencies: Record<string, string[]>;
}

interface AnalysisStep {
  id: string;
  tool: string;
  action: string;
  params: Record<string, any> | ((context: AnalysisContext) => Record<string, any>);
  outputKey: string;
}

// 示例：富集分析流程
const enrichmentPipeline: AnalysisPipeline = {
  steps: [
    {
      id: "get_gene_list",
      tool: "data",
      action: "get_column",
      params: { column: "gene_symbol" },
      outputKey: "genes"
    },
    {
      id: "enrichment_go",
      tool: "enrichment",
      action: "go_analysis",
      params: (ctx) => ({ genes: ctx.results.genes }),
      outputKey: "go_results"
    },
    {
      id: "enrichment_kegg",
      tool: "enrichment",
      action: "kegg_analysis",
      params: (ctx) => ({ genes: ctx.results.genes }),
      outputKey: "kegg_results"
    },
    {
      id: "visualize",
      tool: "visualization",
      action: "enrichment_plot",
      params: (ctx) => ({ 
        go: ctx.results.go_results,
        kegg: ctx.results.kegg_results
      }),
      outputKey: "plot"
    }
  ]
};
```

### 4.3 报告生成

```typescript
// 生成分析报告
interface AnalysisReport {
  title: string;
  summary: string;
  sections: ReportSection[];
  figures: Figure[];
  tables: Table[];
  conclusions: string[];
}

function generateReport(
  analysisType: string,
  results: Record<string, any>
): AnalysisReport {
  switch (analysisType) {
    case "enrichment":
      return generateEnrichmentReport(results);
    case "survival":
      return generateSurvivalReport(results);
    case "differential_expression":
      return generateDEReport(results);
    // ...
  }
}
```

### 4.4 Analysis Agent 实现

```typescript
// src/agents/analysis-agent.ts
export class AnalysisAgent extends BaseAgent {
  id = "analysis-agent";
  name = "分析助手";
  description = "帮助用户调用工具、分析结果、生成报告";
  
  capabilities = {
    inputs: ["data", "model", "question"],
    outputs: ["report", "visualization", "insights"],
    skills: [
      "pubmed-skill", 
      "string-skill", 
      "blast-skill", 
      "enrichment-skill",
      "survival-skill",
      "visualization-skill"
    ]
  };
  
  async processMessage(
    message: string, 
    context: ConversationContext
  ): Promise<AgentResponse> {
    const intent = await this.analyzeIntent(message);
    
    switch (intent.type) {
      case "analyze":
        return await this.handleAnalyze(intent, context);
      case "query":
        return await this.handleQuery(intent, context);
      case "visualize":
        return await this.handleVisualize(intent, context);
      case "report":
        return await this.handleReport(intent, context);
      default:
        return { type: "text", content: "你想分析什么？" };
    }
  }
  
  private async handleAnalyze(
    intent: Intent, 
    context: ConversationContext
  ): Promise<AgentResponse> {
    // 1. 确定分析类型
    const analysisType = this.inferAnalysisType(intent);
    
    // 2. 获取或创建分析流程
    const pipeline = this.getPipeline(analysisType);
    
    // 3. 执行分析
    const results = await this.executePipeline(pipeline, context);
    
    // 4. 生成报告
    const report = this.generateReport(analysisType, results);
    
    return {
      type: "result",
      content: report.summary,
      result: {
        report,
        figures: report.figures,
        tables: report.tables
      }
    };
  }
  
  private async handleQuery(
    intent: Intent, 
    context: ConversationContext
  ): Promise<AgentResponse> {
    // 文献检索、数据库查询等
    const query = intent.query;
    
    // 判断查询类型
    if (this.isLiteratureQuery(query)) {
      const results = await this.callTool("pubmed", "search", { query });
      return {
        type: "result",
        content: this.formatLiteratureResults(results),
        result: results
      };
    }
    
    if (this.isProteinQuery(query)) {
      const results = await this.callTool("string", "interactions", { protein: query });
      return {
        type: "result",
        content: this.formatProteinResults(results),
        result: results
      };
    }
    
    // ...
  }
}
```

---

## Skills 实现

### pubmed-skill

```typescript
// skills/pubmed-skill/index.ts
export class PubMedSkill extends BaseSkill {
  name = "pubmed-skill";
  description = "PubMed 文献检索";
  version = "1.0.0";
  
  tools = [
    {
      name: "search",
      description: "搜索 PubMed 文献",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词" },
          maxResults: { type: "number", default: 10 },
          yearFrom: { type: "number" }
        }
      }
    },
    {
      name: "get_abstract",
      description: "获取文献摘要",
      parameters: {
        type: "object",
        properties: {
          pmid: { type: "string" }
        }
      }
    }
  ];
  
  async execute(toolName: string, params: any): Promise<Result> {
    switch (toolName) {
      case "search":
        return await this.searchPubMed(params.query, params.maxResults, params.yearFrom);
      case "get_abstract":
        return await this.getAbstract(params.pmid);
    }
  }
  
  private async searchPubMed(
    query: string, 
    maxResults: number,
    yearFrom?: number
  ): Promise<Result> {
    // NCBI E-utilities API
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi`;
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi`;
    
    // 1. 搜索获取 PMID
    const searchParams = new URLSearchParams({
      db: "pubmed",
      term: query,
      retmax: String(maxResults),
      retmode: "json"
    });
    
    if (yearFrom) {
      searchParams.set("mindate", `${yearFrom}/01/01`);
    }
    
    const searchResult = await fetch(`${searchUrl}?${searchParams}`).then(r => r.json());
    const pmids = searchResult.esearchresult?.idlist || [];
    
    // 2. 获取文献详情
    const fetchParams = new URLSearchParams({
      db: "pubmed",
      id: pmids.join(","),
      rettype: "abstract",
      retmode: "json"
    });
    
    const fetchResult = await fetch(`${fetchUrl}?${fetchParams}`).then(r => r.json());
    
    return {
      papers: fetchResult.result?.uids?.map((uid: string) => ({
        pmid: uid,
        title: fetchResult.result[uid]?.title,
        authors: fetchResult.result[uid]?.authors,
        journal: fetchResult.result[uid]?.fulljournalname,
        year: fetchResult.result[uid]?.pubdate?.split(" ")[0],
        abstract: fetchResult.result[uid]?.abstract
      }))
    };
  }
}
```

### enrichment-skill

```typescript
// skills/enrichment-skill/index.ts
export class EnrichmentSkill extends BaseSkill {
  name = "enrichment-skill";
  description = "基因富集分析";
  version = "1.0.0";
  
  dependencies = {
    python: ["gseapy", "pandas"]
  };
  
  tools = [
    {
      name: "go_analysis",
      description: "GO 富集分析",
      parameters: {
        type: "object",
        properties: {
          genes: { type: "array", items: { type: "string" } },
          organism: { type: "string", default: "human" }
        }
      }
    },
    {
      name: "kegg_analysis",
      description: "KEGG 通路富集分析",
      parameters: { /* ... */ }
    }
  ];
  
  async execute(toolName: string, params: any): Promise<Result> {
    const code = this.generatePythonCode(toolName, params);
    const result = await localExecutor.executePython(code);
    return JSON.parse(result.stdout);
  }
  
  private generatePythonCode(toolName: string, params: any): string {
    return `
import gseapy as gp
import json

genes = ${JSON.stringify(params.genes)}

if "${toolName}" == "go_analysis":
    enr = gp.enrichr(gene_list=genes, 
                     gene_sets="GO_Biological_Process_2023",
                     organism="${params.organism}")
elif "${toolName}" == "kegg_analysis":
    enr = gp.enrichr(gene_list=genes,
                     gene_sets="KEGG_2021_Human",
                     organism="${params.organism}")

result = enr.results.head(20).to_dict(orient="records")
print(json.dumps(result))
`;
  }
}
```

### visualization-skill

```typescript
// skills/visualization-skill/index.ts
export class VisualizationSkill extends BaseSkill {
  name = "visualization-skill";
  description = "数据可视化";
  version = "1.0.0";
  
  dependencies = {
    python: ["matplotlib", "seaborn", "plotly"]
  };
  
  tools = [
    {
      name: "scatter_plot",
      description: "散点图",
      parameters: { /* ... */ }
    },
    {
      name: "heatmap",
      description: "热图",
      parameters: { /* ... */ }
    },
    {
      name: "enrichment_plot",
      description: "富集分析图",
      parameters: { /* ... */ }
    },
    {
      name: "survival_curve",
      description: "生存曲线",
      parameters: { /* ... */ }
    }
  ];
}
```

---

## 对话示例

```
用户: 分析一下模型识别出的关键基因，看看它们富集在哪些通路

Analysis Agent: 好的，我来做富集分析...
[调用 enrichment-skill]

📊 GO 富集分析结果：

| 通路 | p-value | 基因数 |
|------|---------|--------|
| DNA repair | 2.3e-5 | 8 |
| Cell cycle | 1.1e-4 | 6 |
| Apoptotic process | 3.5e-4 | 5 |

📊 KEGG 通路分析：

| 通路 | p-value | 基因数 |
|------|---------|--------|
| Homologous recombination | 1.2e-6 | 5 |
| p53 signaling pathway | 8.7e-5 | 4 |
| Cell cycle | 2.1e-4 | 4 |

📈 [富集分析图]

📝 结论：
模型识别的关键基因主要富集在 DNA 修复和细胞周期相关通路，
这与肝癌预后相关的生物学机制一致。

你想进一步查看这些通路的详细信息吗？

用户: 查一下 TP53 在 STRING 数据库中的互作蛋白

Analysis Agent: 好的，我来查询 STRING 数据库...
[调用 string-skill]

📊 TP53 蛋白互作网络：

| 互作蛋白 | 置信度 | 证据类型 |
|----------|--------|----------|
| MDM2 | 0.999 | 实验、数据库 |
| BRCA1 | 0.998 | 实验、共表达 |
| BRCA2 | 0.995 | 实验 |
| BAX | 0.992 | 实验 |
| CDKN1A | 0.990 | 实验 |

📈 [蛋白互作网络图]

这些互作蛋白中，BRCA1 和 BRCA2 也在你的模型关键基因列表中，
说明模型识别的基因确实参与了 TP53 相关的 DNA 修复通路。
```

---

## 验收标准

1. 能调用 PubMed、STRING 等外部数据库
2. 能执行富集分析等常见分析流程
3. 能生成可视化图表
4. 能生成结构化分析报告
5. 对话流畅，能理解分析需求