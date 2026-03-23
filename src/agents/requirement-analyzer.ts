/**
 * Requirement Analyzer - LLM 驱动的需求分析器
 *
 * 使用 LLM 来：
 * 1. 理解需求文档
 * 2. 分解任务步骤
 * 3. 匹配可用 Skills
 * 4. 生成数据处理代码
 */

import OpenAI from 'openai';
import type { RequirementDocument, DatasetInfo, OutputRequirements } from './requirement-doc.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * 数据结构分析结果
 */
export interface DataAnalysisResult {
  columns: string[];
  shape: { rows: number; columns: number };
  sample: Record<string, unknown>[];
}

export interface AnalysisPlan {
  steps: AnalysisStep[];
  reasoning: string;
}

export interface AnalysisStep {
  id: string;
  description: string;
  skill?: string;
  tool?: string;
  params?: Record<string, unknown>;
  code?: string;  // 如果需要生成代码
  dependencies?: string[];  // 依赖的前置步骤 ID
}

export interface GeneratedCode {
  code: string;
  explanation: string;
  requiredPackages: string[];
}

/**
 * LLM 客户端实例
 */
let llmClient: OpenAI | null = null;

function getLLMClient(): OpenAI | null {
  if (!llmClient && config.llm.apiKey) {
    llmClient = new OpenAI({
      apiKey: config.llm.apiKey,
      baseURL: config.llm.baseUrl,
    });
  }
  return llmClient;
}

/**
 * 使用 LLM 分析需求文档，生成分析计划
 */
export async function analyzeRequirement(
  doc: RequirementDocument,
  availableSkills: Array<{ name: string; description: string; tools: Array<{ name: string; description: string }> }>
): Promise<AnalysisPlan | null> {
  const client = getLLMClient();
  if (!client) {
    logger.warn('[analyzeRequirement] LLM not available, falling back to pattern matching');
    return null;
  }

  const systemPrompt = `你是一个数据分析专家。你需要分析需求文档，制定数据处理计划。

## 可用的 Skills 和 Tools

${availableSkills.map(s => `### ${s.name}
${s.description}
可用工具: ${s.tools.map(t => `${t.name}(${t.description})`).join(', ')}`).join('\n\n')}

## 输出格式

返回 JSON 格式的分析计划：
{
  "reasoning": "分析思路说明",
  "steps": [
    {
      "id": "step_1",
      "description": "步骤描述",
      "skill": "skill-name",
      "tool": "tool-name",
      "params": {},
      "dependencies": []
    }
  ]
}

注意：
1. 步骤要有明确的依赖关系
2. 如果某个操作需要自定义代码，不需要指定 skill/tool，而是描述清楚要做什么
3. 最终要产出用户需要的结果`;

  const userPrompt = `## 需求文档

标题: ${doc.title}

### 数据源
${doc.datasets.map(d => `- ${d.file}: ${d.description}`).join('\n')}

### 目标
${doc.goals.join('\n')}

${doc.outputRequirements ? `### 输出要求
- 格式: ${doc.outputRequirements.format || '未指定'}
- 文件名: ${doc.outputRequirements.filename || '未指定'}
${doc.outputRequirements.deduplication ? '- 去重' : ''}
${doc.outputRequirements.noIndex ? '- 无索引列' : ''}` : ''}

请分析这个需求，制定数据处理计划。`;

  try {
    const response = await client.chat.completions.create({
      model: config.llm.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const raw = response.choices[0]?.message?.content || '';
    // 提取 JSON
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('[analyzeRequirement] No JSON found in response');
      return null;
    }

    const plan = JSON.parse(jsonMatch[0]) as AnalysisPlan;
    logger.info(`[analyzeRequirement] Generated plan with ${plan.steps.length} steps`);
    return plan;
  } catch (error) {
    logger.error('[analyzeRequirement] Failed:', error);
    return null;
  }
}

/**
 * 使用 LLM 生成数据处理代码
 * 包含数据预分析步骤，提供详细的数据结构信息给 LLM
 */
export async function generateDataProcessingCode(
  doc: RequirementDocument,
  resolvedPaths: Map<string, string>,
  outputPath: string
): Promise<GeneratedCode | null> {
  const client = getLLMClient();
  if (!client) {
    logger.warn('[generateDataProcessingCode] LLM not available');
    return null;
  }

  // 预分析数据结构
  const dataAnalysis = await preAnalyzeData(resolvedPaths);
  
  const systemPrompt = `你是一个 Python 数据处理专家。你需要根据需求文档生成完整的数据处理代码。

## 要求

1. 使用 pandas 进行数据处理
2. 代码必须完整可运行
3. 包含清晰的注释
4. 处理异常情况
5. 最后保存结果到指定路径
6. **使用 os.path.dirname(__file__) 来定位输入文件，不要硬编码相对路径**

## 文件路径处理模式（必须遵守）

\`\`\`python
import os
from pathlib import Path

# 获取当前脚本所在目录（job 目录）
job_dir = Path(__file__).parent
inputs_dir = job_dir / 'inputs'
outputs_dir = job_dir / 'outputs'
outputs_dir.mkdir(parents=True, exist_ok=True)

# 使用 glob 或循环查找实际文件（文件名可能有时间戳前缀）
for f in inputs_dir.iterdir():
    if 'keyword' in f.name:  # 根据文件名关键词匹配
        df = pd.read_csv(f)
\`\`\`

## 数据整合的关键模式

### 1. 长格式转换（Tidy Data）
当需要将宽格式数据转为长格式时：
\`\`\`python
# 宽格式 -> 长格式
df_long = df.melt(id_vars=['id_column'], var_name='new_col_name', value_name='value')
\`\`\`

### 2. 矩阵转置
当数据是 gene × cell 格式，需要转为 cell × gene：
\`\`\`python
# 转置矩阵（第一列是 gene_id）
df_t = df.set_index('gene_id').T.reset_index()
df_t = df_t.rename(columns={'index': 'cell_barcode'})
\`\`\`

### 3. 多表合并
当需要合并多个表时，识别公共列作为合并键：
\`\`\`python
# 先处理每个表，再合并
result = df1.merge(df2, on='common_column', how='left')
result = result.merge(df3, on='another_common_column', how='left')
\`\`\`

### 4. 长格式整合示例
假设有：
- count_matrix: gene × cell（需要转置 + melt）
- cell_metadata: cell 信息
- gene_annotation: gene 信息

目标是生成每行一个「细胞 × 基因」的记录：
\`\`\`python
import pandas as pd
from pathlib import Path
import os

job_dir = Path(__file__).parent
inputs_dir = job_dir / 'inputs'
outputs_dir = job_dir / 'outputs'
outputs_dir.mkdir(parents=True, exist_ok=True)

# 查找并加载文件
cell_metadata = None
count_matrix = None
gene_annotation = None

for f in inputs_dir.iterdir():
    if 'cell_metadata' in f.name:
        cell_metadata = pd.read_csv(f)
    elif 'count_matrix' in f.name:
        count_matrix = pd.read_csv(f)
    elif 'gene_annotation' in f.name:
        gene_annotation = pd.read_csv(f)

# 1. 转置矩阵（gene × cell -> cell × gene）
count_t = count_matrix.set_index('gene_id').T.reset_index()
count_t = count_t.rename(columns={'index': 'cell_barcode'})

# 2. 转为长格式
count_long = count_t.melt(id_vars=['cell_barcode'], var_name='gene_id', value_name='expression_count')

# 3. 合并数据
result = count_long.merge(cell_metadata, on='cell_barcode', how='left')
result = result.merge(gene_annotation, on='gene_id', how='left')

# 4. 去重并保存
result = result.drop_duplicates()
result.to_csv(outputs_dir / 'integrated_data.csv', index=False)
print(f"Saved: {result.shape}")
\`\`\`

## 输出格式

返回 JSON 格式：
{
  "code": "完整的 Python 代码",
  "explanation": "代码说明",
  "requiredPackages": ["pandas", "numpy", ...]
}`;

  const dataInfo = doc.datasets.map((d, i) => {
    const resolvedPath = resolvedPaths.get(d.file) || d.file;
    const analysis = dataAnalysis.get(d.file);
    
    let info = `数据集 ${i}: ${d.file}\n`;
    info += `  - 描述: ${d.description || d.type}\n`;
    info += `  - 路径: ${resolvedPath}\n`;
    
    if (analysis) {
      info += `  - 行数: ${analysis.shape.rows}\n`;
      info += `  - 列数: ${analysis.shape.columns}\n`;
      info += `  - 列名: ${analysis.columns.slice(0, 15).join(', ')}${analysis.columns.length > 15 ? '...' : ''}\n`;
      if (analysis.sample.length > 0) {
        const sampleStr = JSON.stringify(analysis.sample[0], null, 2).slice(0, 200);
        info += `  - 示例数据: ${sampleStr}\n`;
      }
    }
    
    return info;
  }).join('\n');

  const userPrompt = `## 需求

标题: ${doc.title}

### 数据文件

${dataInfo}

### 目标

${doc.goals.join('\n')}

${doc.outputRequirements ? `### 输出要求
- 格式: ${doc.outputRequirements.format || 'CSV'}
- 文件名: ${doc.outputRequirements.filename || 'result.csv'}
- 输出目录: ${outputPath}
${doc.outputRequirements.deduplication ? '- 去除重复行' : ''}
${doc.outputRequirements.noIndex ? '- 不保存索引列' : ''}` : ''}

请生成完整的数据处理代码。**关键要求**：
1. **必须使用提供的实际文件路径**（不是原始文件名）
2. 根据数据文件的列名识别合并键
3. 如果需要转置矩阵，确保正确处理
4. **代码必须包含完整的数据处理逻辑**，不能只有 TODO 注释
5. 生成的代码要能直接运行

**特别注意**：不要在代码中使用 data/job_xxx 这样的相对路径，而是使用 os.path.dirname(__file__) 来定位文件`;

  try {
    const response = await client.chat.completions.create({
      model: config.llm.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    const raw = response.choices[0]?.message?.content || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('[generateDataProcessingCode] No JSON found in response');
      // 如果没有找到 JSON，可能是代码块格式
      const codeMatch = raw.match(/```(?:python)?\s*([\s\S]*?)```/);
      if (codeMatch) {
        return {
          code: codeMatch[1].trim(),
          explanation: '代码已生成',
          requiredPackages: ['pandas'],
        };
      }
      return null;
    }

    const result = JSON.parse(jsonMatch[0]) as GeneratedCode;
    logger.info('[generateDataProcessingCode] Generated code successfully');
    return result;
  } catch (error) {
    logger.error('[generateDataProcessingCode] Failed:', error);
    return null;
  }
}

/**
 * 执行生成的 Python 代码
 */
export async function executeGeneratedCode(
  code: string,
  jobId: string
): Promise<{ success: boolean; output: string; error?: string }> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  const jobDir = `${config.data.dir}/${jobId}`;
  
  try {
    const { stdout, stderr } = await execAsync(`${config.python.path} -c "${code.replace(/"/g, '\\"')}"`, {
      cwd: jobDir,
      maxBuffer: 1024 * 1024 * 10,  // 10MB buffer
    });
    
    return {
      success: true,
      output: stdout || stderr,
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 预分析数据文件结构
 * 在代码生成前，先了解每个数据文件的列名、形状和样本数据
 */
export async function preAnalyzeData(
  resolvedPaths: Map<string, string>
): Promise<Map<string, DataAnalysisResult>> {
  const results = new Map<string, DataAnalysisResult>();
  
  // 动态导入 csv-skill 避免循环依赖
  const { csvSkill } = await import('../skills/csv-skill.js');
  
  for (const [originalName, actualPath] of resolvedPaths) {
    try {
      const data = await csvSkill.execute('read_file', { path: actualPath }) as {
        shape: { rows: number; columns: number };
        columns: { name: string; type: string }[];
        preview: Record<string, unknown>[];
      };
      
      results.set(originalName, {
        columns: data.columns.map(c => c.name),
        shape: data.shape,
        sample: data.preview.slice(0, 3),
      });
      
      logger.info(`[preAnalyzeData] Analyzed ${originalName}: ${data.shape.rows} rows, ${data.shape.columns} columns`);
    } catch (error) {
      logger.warn(`[preAnalyzeData] Failed to analyze ${originalName}:`, error);
    }
  }
  
  return results;
}
