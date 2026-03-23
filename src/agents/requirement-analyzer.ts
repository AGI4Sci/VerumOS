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

  const systemPrompt = `你是一个 Python 数据处理专家。你需要根据需求文档生成完整的数据处理代码。

## 要求

1. 使用 pandas 进行数据处理
2. 代码必须完整可运行
3. 包含清晰的注释
4. 处理异常情况
5. 最后保存结果到指定路径

## 输出格式

返回 JSON 格式：
{
  "code": "完整的 Python 代码",
  "explanation": "代码说明",
  "requiredPackages": ["pandas", "numpy", ...]
}`;

  const dataInfo = doc.datasets.map((d, i) => {
    const resolvedPath = resolvedPaths.get(d.file) || d.file;
    return `data_${i}: ${d.file} (${d.description}) -> 路径: ${resolvedPath}`;
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

请生成完整的数据处理代码。`;

  try {
    const response = await client.chat.completions.create({
      model: config.llm.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 3000,
    });

    const raw = response.choices[0]?.message?.content || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('[generateDataProcessingCode] No JSON found in response');
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
