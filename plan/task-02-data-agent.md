# Task 02 · Data Agent 实现

## 目标

实现 Data Agent，帮助用户处理和整合数据。

---

## 核心功能

### 2.1 数据格式识别

```typescript
// 自动识别文件格式
async function detectFormat(filePath: string): Promise<DataFormat> {
  const ext = path.extname(filePath).toLowerCase();
  
  // 常见格式
  const formatMap: Record<string, DataFormat> = {
    ".csv": { type: "tabular", engine: "pandas", reader: "read_csv" },
    ".xlsx": { type: "tabular", engine: "pandas", reader: "read_excel" },
    ".xls": { type: "tabular", engine: "pandas", reader: "read_excel" },
    ".tsv": { type: "tabular", engine: "pandas", reader: "read_csv" },
    ".json": { type: "structured", engine: "json", reader: "json.load" },
    ".yaml": { type: "structured", engine: "yaml", reader: "yaml.safe_load" },
    ".fasta": { type: "bioinfo", engine: "biopython", reader: "SeqIO.parse" },
    ".fa": { type: "bioinfo", engine: "biopython", reader: "SeqIO.parse" },
    ".fastq": { type: "bioinfo", engine: "biopython", reader: "SeqIO.parse" },
    ".fq": { type: "bioinfo", engine: "biopython", reader: "SeqIO.parse" },
    ".vcf": { type: "bioinfo", engine: "pysam", reader: "VariantFile" },
    ".bam": { type: "bioinfo", engine: "pysam", reader: "AlignmentFile" },
    ".h5": { type: "hdf5", engine: "h5py", reader: "File" },
    ".hdf5": { type: "hdf5", engine: "h5py", reader: "File" },
  };
  
  return formatMap[ext] || { type: "unknown", engine: null, reader: null };
}
```

### 2.2 数据探索

```typescript
// 探索数据内容
interface DataExploration {
  // 基本信息
  shape: { rows: number; columns: number };
  columns: ColumnInfo[];
  
  // 统计摘要
  statistics: {
    numeric: NumericStats[];
    categorical: CategoricalStats[];
    datetime: DatetimeStats[];
  };
  
  // 数据质量
  quality: {
    missingValues: Record<string, number>;
    duplicates: number;
    outliers: Record<string, number>;
  };
  
  // 数据预览
  preview: {
    head: any[];
    sample: any[];
  };
}

interface ColumnInfo {
  name: string;
  type: "numeric" | "categorical" | "datetime" | "text" | "boolean";
  nullable: boolean;
  uniqueCount: number;
}
```

### 2.3 数据整合建议

```typescript
// 分析多个数据集，提出整合建议
async function suggestMerge(
  datasets: Dataset[]
): Promise<MergeSuggestion[]> {
  const suggestions: MergeSuggestion[] = [];
  
  // 1. 寻找可能的关联键
  for (let i = 0; i < datasets.length; i++) {
    for (let j = i + 1; j < datasets.length; j++) {
      const commonColumns = findCommonColumns(datasets[i], datasets[j]);
      if (commonColumns.length > 0) {
        suggestions.push({
          datasets: [datasets[i].id, datasets[j].id],
          on: commonColumns,
          confidence: calculateConfidence(commonColumns),
          recommendation: generateRecommendation(commonColumns)
        });
      }
    }
  }
  
  return suggestions;
}
```

### 2.4 Data Agent 实现

```typescript
// src/agents/data-agent.ts
export class DataAgent extends BaseAgent {
  id = "data-agent";
  name = "数据助手";
  description = "帮助用户处理和整合数据";
  
  capabilities = {
    inputs: ["file", "url", "database", "api"],
    outputs: ["dataset", "report"],
    skills: ["csv-skill", "json-skill", "sql-skill", "bioinfo-skill"]
  };
  
  async processMessage(
    message: string, 
    context: ConversationContext
  ): Promise<AgentResponse> {
    // 1. 分析用户意图
    const intent = await this.analyzeIntent(message);
    
    switch (intent.type) {
      case "upload":
        return await this.handleUpload(intent, context);
      case "explore":
        return await this.handleExplore(intent, context);
      case "transform":
        return await this.handleTransform(intent, context);
      case "merge":
        return await this.handleMerge(intent, context);
      case "question":
        return await this.handleQuestion(intent, context);
      default:
        return { type: "text", content: "我不太理解你的需求，能详细说明一下吗？" };
    }
  }
  
  private async handleExplore(
    intent: Intent, 
    context: ConversationContext
  ): Promise<AgentResponse> {
    const datasetId = intent.datasetId;
    const dataset = context.datasets.get(datasetId);
    
    if (!dataset) {
      return { type: "text", content: "请先上传数据文件" };
    }
    
    // 调用 Skill 探索数据
    const exploration = await this.callTool(
      dataset.skill,
      "explore_data",
      { data_id: datasetId }
    );
    
    // 生成探索报告
    const report = this.generateExplorationReport(exploration);
    
    return {
      type: "result",
      content: report,
      result: exploration
    };
  }
  
  private async handleMerge(
    intent: Intent, 
    context: ConversationContext
  ): Promise<AgentResponse> {
    // 分析数据集，提出整合建议
    const suggestions = await this.suggestMerge(
      Array.from(context.datasets.values())
    );
    
    if (suggestions.length === 0) {
      return {
        type: "text",
        content: "我没有找到明显的关联键，你能告诉我应该用哪些字段来关联这些数据吗？"
      };
    }
    
    // 返回建议，让用户确认
    return {
      type: "question",
      content: "我发现了以下整合方案：",
      questions: [{
        id: "merge_choice",
        text: "请选择整合方案：",
        options: suggestions.map((s, i) => ({
          label: `方案 ${i + 1}: 用 ${s.on.join(", ")} 关联`,
          value: i
        }))
      }]
    };
  }
}
```

---

## Skills 实现

### csv-skill

```typescript
// skills/csv-skill/index.ts
export class CSVSkill extends BaseSkill {
  name = "csv-skill";
  description = "处理 CSV 和 Excel 文件";
  version = "1.0.0";
  
  capabilities = {
    formats: [".csv", ".xlsx", ".xls", ".tsv"],
    operations: ["read", "explore", "transform", "merge", "export"]
  };
  
  dependencies = {
    python: ["pandas>=2.0", "openpyxl"]
  };
  
  tools = [
    {
      name: "read_file",
      description: "读取 CSV 或 Excel 文件",
      parameters: { /* ... */ }
    },
    {
      name: "explore_data",
      description: "探索数据内容",
      parameters: { /* ... */ }
    },
    {
      name: "transform_data",
      description: "数据转换",
      parameters: { /* ... */ }
    },
    {
      name: "merge_data",
      description: "合并数据集",
      parameters: { /* ... */ }
    }
  ];
  
  async execute(toolName: string, params: any): Promise<Result> {
    const pythonCode = this.generatePythonCode(toolName, params);
    const result = await localExecutor.executePython(pythonCode);
    return JSON.parse(result.stdout);
  }
  
  private generatePythonCode(toolName: string, params: any): string {
    switch (toolName) {
      case "read_file":
        return `
import pandas as pd
df = pd.read_csv("${params.path}")
print(df.to_json())
`;
      case "explore_data":
        return `
import pandas as pd
import json

df = pd.read_csv("${params.path}")
result = {
  "shape": {"rows": len(df), "columns": len(df.columns)},
  "columns": [{"name": c, "type": str(df[c].dtype)} for c in df.columns],
  "missing": df.isnull().sum().to_dict(),
  "preview": df.head(5).to_dict(orient="records")
}
print(json.dumps(result))
`;
      // ... 其他工具
    }
  }
}
```

---

## 对话示例

```
用户: 我有一份 RNA-seq 数据 expression.csv

Data Agent: 好的，让我来看看这份数据...
[调用 csv-skill]

📊 数据概览：
- 文件：expression.csv
- 大小：373 行 × 20,531 列
- 格式：TPM normalized

📋 列信息：
- 基因表达列：20,531 个基因
- 行索引：样本 ID

⚠️ 发现：
- 3 个基因有缺失值（< 1%）
- 数据已标准化

你想对这份数据做什么处理？

用户: 我还有一份临床数据 clinical.xlsx，想把它们整合起来

Data Agent: 好的，让我看看临床数据...
[调用 csv-skill]

📊 临床数据概览：
- 文件：clinical.xlsx
- 大小：373 行 × 15 列
- 关键字段：patient_id, OS_time, OS_status, Age, Stage...

🔗 整合建议：
我发现两份数据都有 373 行，可能是同一批患者。
- expression.csv 的行索引看起来是样本 ID
- clinical.xlsx 有 patient_id 列

请确认：
1. expression.csv 的行索引是样本 ID 吗？
2. 样本 ID 和 patient_id 的格式一致吗？

用户: 是的，可以用样本 ID 关联

Data Agent: 好的，我来整合这两份数据...
[调用 csv-skill merge_data]

✅ 整合完成！
- 合并后数据：373 行 × 20,546 列
- 关联键：样本 ID = patient_id
- 无缺失关联

你可以继续处理这份数据，或者告诉我下一步想做什么。
```

---

## 验收标准

1. 能识别常见数据格式（CSV、Excel、JSON）
2. 能探索数据内容并生成报告
3. 能提出数据整合建议
4. 能执行数据整合操作
5. 对话流畅，能理解用户意图