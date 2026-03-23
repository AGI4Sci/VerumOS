import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export interface RequirementDocument {
  sessionId: string;
  jobId?: string;  // 关联的 Job ID
  title: string;
  content: string;
  status: 'draft' | 'discussing' | 'confirmed' | 'executing' | 'completed';
  datasets: DatasetInfo[];
  goals: string[];
  analysisPlan: AnalysisStep[];
  outputRequirements?: OutputRequirements;  // 新增：输出要求
  updatedAt: string;
}

export interface OutputRequirements {
  format?: string;       // 输出格式，如 "CSV"
  filename?: string;     // 输出文件名，如 "integrated_data.csv"
  deduplication?: boolean;  // 是否去重
  noIndex?: boolean;     // 是否无索引列
  additional?: string[]; // 其他要求
}

export interface DatasetInfo {
  file: string;
  type: string;
  description: string;
}

export interface AnalysisStep {
  step: number;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
}

const REQUIREMENT_DIR = 'requirements';

async function ensureRequirementDir(): Promise<string> {
  const dataDir = path.resolve(config.data.dir);
  const reqDir = path.join(dataDir, REQUIREMENT_DIR);
  try {
    await fs.mkdir(reqDir, { recursive: true });
    return reqDir;
  } catch {
    return reqDir;
  }
}

// 获取 Job 目录下的需求文档路径
async function getJobRequirementPath(jobId: string): Promise<string | null> {
  if (!jobId) return null;
  const jobDir = path.join(config.data.dir, jobId);
  try {
    await fs.mkdir(jobDir, { recursive: true });
    return path.join(jobDir, 'requirement.md');
  } catch {
    return null;
  }
}

export async function getRequirementDocument(sessionId: string): Promise<RequirementDocument | null> {
  try {
    const reqDir = await ensureRequirementDir();
    const filePath = path.join(reqDir, `${sessionId}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    const doc = JSON.parse(content) as RequirementDocument;
    
    // 如果有关联的 Job，也读取 Job 目录下的 markdown 文件
    if (doc.jobId) {
      const jobReqPath = await getJobRequirementPath(doc.jobId);
      if (jobReqPath) {
        try {
          const mdContent = await fs.readFile(jobReqPath, 'utf-8');
          doc.content = mdContent;
        } catch {
          // 文件不存在，使用 JSON 中的内容
        }
      }
    }
    
    return doc;
  } catch {
    return null;
  }
}

export async function saveRequirementDocument(doc: RequirementDocument): Promise<string | null> {
  // 保存 JSON 元数据
  const reqDir = await ensureRequirementDir();
  const filePath = path.join(reqDir, `${doc.sessionId}.json`);
  doc.updatedAt = new Date().toISOString();
  await fs.writeFile(filePath, JSON.stringify(doc, null, 2), 'utf-8');
  logger.info(`Saved requirement document for session ${doc.sessionId}`);
  
  // 如果有关联的 Job，同时保存 markdown 到 Job 目录
  let jobMdPath: string | null = null;
  if (doc.jobId) {
    jobMdPath = await getJobRequirementPath(doc.jobId);
    if (jobMdPath) {
      const markdown = documentToMarkdown(doc);
      await fs.writeFile(jobMdPath, markdown, 'utf-8');
      logger.info(`Saved requirement.md to job directory: ${doc.jobId}`);
    }
  }
  
  return jobMdPath;
}

export async function createRequirementDocument(sessionId: string, title?: string, jobId?: string): Promise<RequirementDocument> {
  const doc: RequirementDocument = {
    sessionId,
    jobId,
    title: title || '需求文档',
    content: '',
    status: 'draft',
    datasets: [],
    goals: [],
    analysisPlan: [],
    updatedAt: new Date().toISOString(),
  };
  await saveRequirementDocument(doc);
  return doc;
}

export async function updateRequirementDocument(
  sessionId: string,
  updates: Partial<RequirementDocument>
): Promise<RequirementDocument | null> {
  const existing = await getRequirementDocument(sessionId);
  if (!existing) {
    return null;
  }
  const updated = { ...existing, ...updates, sessionId };
  await saveRequirementDocument(updated);
  return updated;
}

export function parseMarkdownToDocument(markdown: string): Partial<RequirementDocument> {
  const result: Partial<RequirementDocument> = {
    content: markdown,
  };

  // 解析标题
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    result.title = titleMatch[1];
  }

  // 解析数据源表格 - 支持多种标题格式：数据源、数据、数据来源
  const dataSection = markdown.match(/##\s*数据(?:来源|源)?\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (dataSection) {
    // 优先解析表格格式
    const tableRows = dataSection[1].match(/\|.+\|/g);
    if (tableRows && tableRows.length > 2) {
      // 解析表头确定列映射
      const headerRow = tableRows[0];
      const headers = headerRow.split('|').map((c) => c.trim().toLowerCase()).filter(Boolean);
      
      // 查找关键列的位置
      const fileColIndex = headers.findIndex(h => h.includes('文件') || h.includes('file') || h.includes('名称') || h.includes('name'));
      const descColIndex = headers.findIndex(h => h.includes('描述') || h.includes('说明') || h.includes('desc'));
      
      const tableDatasets: DatasetInfo[] = [];
      
      for (let i = 2; i < tableRows.length; i++) {
        const row = tableRows[i];
        const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
        
        // 确定文件名列
        let fileCell = fileColIndex >= 0 ? cells[fileColIndex] : cells[0];
        // 移除反引号
        fileCell = fileCell?.replace(/[`]/g, '').trim() || '';
        
        // 确定描述列
        let descCell = descColIndex >= 0 ? cells[descColIndex] : (cells[1] || '');
        
        // 跳过分隔行和空行
        if (fileCell && !fileCell.startsWith('-') && fileCell !== '' && 
            /[a-zA-Z0-9_\-./]+\.(?:csv|tsv|xlsx|xls)/i.test(fileCell)) {
          tableDatasets.push({
            file: fileCell,
            type: 'data file',
            description: descCell,
          });
        }
      }
      
      if (tableDatasets.length > 0) {
        result.datasets = tableDatasets;
      }
    }

    // 如果表格解析失败，尝试提取文件名
    if (!result.datasets || result.datasets.length === 0) {
      const fileMatches = dataSection[1].matchAll(/([a-zA-Z0-9_\-./]+\.(?:csv|tsv|xlsx|xls))/gi);
      const datasets: DatasetInfo[] = [];
      for (const match of fileMatches) {
        datasets.push({
          file: match[1],
          type: 'data file',
          description: '',
        });
      }
      if (datasets.length > 0) {
        result.datasets = datasets;
      }
    }
  }

  // 解析目标 - 支持 "目标" 或 "处理目标"
  const goalSection = markdown.match(/##\s*(?:处理)?目标\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (goalSection) {
    // 提取核心目标
    const coreGoal = goalSection[1].match(/\*\*核心\*\*[：:]\s*(.+?)(?:\n|$)/i);
    if (coreGoal) {
      result.goals = [coreGoal[1].trim()];
    } else {
      const goals = goalSection[1]
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => line.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean);
      result.goals = goals;
    }
  }

  // 解析分析方案
  const planSection = markdown.match(/##\s*分析方案\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (planSection) {
    const steps = planSection[1]
      .split('\n')
      .filter((line) => /^\s*[-*]\s*\*\*/.test(line) || /^\s*\d+\./.test(line))
      .map((line, index) => ({
        step: index + 1,
        description: line.replace(/^\s*[-*]\s*/, '').replace(/^\d+\.\s*/, '').trim(),
        status: 'pending' as const,
      }));
    result.analysisPlan = steps;
  }

  // 解析状态
  const statusMatch = markdown.match(/\*\*状态\*\*[：:]\s*(.+)/i);
  if (statusMatch) {
    const statusText = statusMatch[1].toLowerCase();
    if (statusText.includes('完成')) {
      result.status = 'completed';
    } else if (statusText.includes('执行中')) {
      result.status = 'executing';
    } else if (statusText.includes('确认') || statusText.includes('confirmed')) {
      result.status = 'confirmed';
    } else if (statusText.includes('讨论')) {
      result.status = 'discussing';
    } else {
      result.status = 'draft';
    }
  }

  // 解析输出要求
  const outputSection = markdown.match(/##\s*输出要求\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (outputSection) {
    const outputText = outputSection[1];
    const output: OutputRequirements = {};
    
    // 解析格式
    const formatMatch = outputText.match(/格式[：:]\s*(\w+)/i);
    if (formatMatch) {
      output.format = formatMatch[1].toUpperCase();
    }
    
    // 解析文件名
    const filenameMatch = outputText.match(/文件名[：:]\s*`?([^`\n]+)`?/i);
    if (filenameMatch) {
      output.filename = filenameMatch[1].replace(/[`]/g, '').trim();
    }
    
    // 解析去重要求
    if (/无重复行|去重|deduplicate/i.test(outputText)) {
      output.deduplication = true;
    }
    
    // 解析无索引列要求
    if (/无.*索引列|无多余索引|no.*index/i.test(outputText)) {
      output.noIndex = true;
    }
    
    if (Object.keys(output).length > 0) {
      result.outputRequirements = output;
    }
  }

  return result;
}

export function documentToMarkdown(doc: RequirementDocument): string {
  const lines: string[] = [];

  lines.push(`# ${doc.title}`);
  lines.push('');
  lines.push(`**状态**：${getStatusText(doc.status)}`);
  lines.push(`**更新时间**：${doc.updatedAt}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 数据源
  if (doc.datasets.length > 0) {
    lines.push('## 数据源');
    lines.push('');
    lines.push('| 文件 | 类型 | 描述 |');
    lines.push('|------|------|------|');
    for (const ds of doc.datasets) {
      lines.push(`| ${ds.file} | ${ds.type} | ${ds.description} |`);
    }
    lines.push('');
  }

  // 目标
  if (doc.goals.length > 0) {
    lines.push('## 目标');
    lines.push('');
    for (const goal of doc.goals) {
      lines.push(`- ${goal}`);
    }
    lines.push('');
  }

  // 分析方案
  if (doc.analysisPlan.length > 0) {
    lines.push('## 分析方案');
    lines.push('');
    for (const step of doc.analysisPlan) {
      const checkbox = step.status === 'completed' ? '[x]' : '[ ]';
      lines.push(`${step.step}. ${step.description} ${checkbox}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function getStatusText(status: RequirementDocument['status']): string {
  switch (status) {
    case 'draft':
      return '草稿';
    case 'discussing':
      return '需求讨论中';
    case 'confirmed':
      return '方案已确认';
    case 'executing':
      return '执行中';
    case 'completed':
      return '已完成';
    default:
      return '未知';
  }
}

/**
 * 分析类型配置（已弃用硬编码，保留向后兼容）
 * 现在使用 LLM 驱动的 analyzeRequirement 函数
 */
const ANALYSIS_PATTERNS: Array<{
  name: string;
  patterns: RegExp[];
  steps: Array<{ skill: string; tool: string; params: Record<string, unknown> }>;
  finalOutput?: string;
}> = [];

/**
 * 解析实际文件路径
 * 在 inputs 目录中查找匹配的文件
 */
async function resolveActualFilePath(
  originalFileName: string,
  jobId?: string
): Promise<string | null> {
  if (!jobId) {
    // 没有 jobId，返回原始文件名（可能存在于 data/ 根目录）
    return path.resolve(config.data.dir, originalFileName);
  }

  const inputsDir = path.join(config.data.dir, jobId, 'inputs');
  
  try {
    const entries = await fs.readdir(inputsDir);
    // 精确匹配
    const exactMatch = entries.find(entry => entry === originalFileName);
    if (exactMatch) {
      return path.join(inputsDir, exactMatch);
    }
    // 如果找不到精确匹配，返回期望路径
    return path.join(inputsDir, originalFileName);
  } catch {
    // 目录不存在，返回期望路径
    return path.join(inputsDir, originalFileName);
  }
}

/**
 * 生成工具链（LLM 驱动版本）
 * 使用 LLM 分析需求并智能选择和编排 skills
 */
export async function generateToolChain(doc: RequirementDocument): Promise<Array<{ skill: string; tool: string; params: Record<string, unknown> }>> {
  // 定义可用的 Skills
  const availableSkills = [
    {
      name: 'csv-skill',
      description: 'CSV/TSV/Excel 文件处理',
      tools: [
        { name: 'read_file', description: '读取文件并返回基本概览' },
        { name: 'explore_data', description: '数据探索，返回统计信息' },
        { name: 'transform_data', description: '数据转换（filter、normalize、log2）' },
        { name: 'merge_data', description: '按键合并多个数据集' },
        { name: 'transpose', description: '矩阵转置，交换行和列' },
      ],
    },
    {
      name: 'bioinfo-skill',
      description: '生物信息学分析',
      tools: [
        { name: 'quality_control', description: '数据质量控制' },
        { name: 'normalize_counts', description: '数据标准化' },
        { name: 'find_markers', description: '寻找 marker 基因' },
      ],
    },
  ];

  // 尝试使用 LLM 分析需求
  try {
    const { analyzeRequirement } = await import('./requirement-analyzer.js');
    const plan = await analyzeRequirement(doc, availableSkills);
    
    if (plan && plan.steps.length > 0) {
      const chain = plan.steps
        .filter(step => step.skill && step.tool)
        .map(step => ({
          skill: step.skill!,
          tool: step.tool!,
          params: step.params || {},
        }));
      
      if (chain.length > 0) {
        logger.info(`[generateToolChain] LLM generated ${chain.length} steps`);
        return chain;
      }
    }
  } catch (error) {
    logger.warn('[generateToolChain] LLM analysis failed, using fallback:', error);
  }

  // 回退：默认只读取文件
  return generateDefaultToolChain(doc);
}

/**
 * 默认工具链生成（简单回退）
 */
async function generateDefaultToolChain(doc: RequirementDocument): Promise<Array<{ skill: string; tool: string; params: Record<string, unknown> }>> {
  const chain: Array<{ skill: string; tool: string; params: Record<string, unknown> }> = [];
  
  // 存储解析后的文件路径
  const resolvedPaths: Map<string, string> = new Map();

  // 读取所有数据文件
  for (const ds of doc.datasets) {
    const ext = path.extname(ds.file).toLowerCase();
    
    if (['.csv', '.tsv', '.xlsx', '.xls'].includes(ext)) {
      // 解析实际文件路径
      const actualPath = await resolveActualFilePath(ds.file, doc.jobId);
      const resolvedPath = actualPath || ds.file;
      
      resolvedPaths.set(ds.file, resolvedPath);
      
      chain.push({
        skill: 'csv-skill',
        tool: 'read_file',
        params: { 
          path: resolvedPath,
          displayName: ds.file,
          description: ds.description || ds.type 
        },
      });
    }
  }

  return chain;
}

/**
 * 生成 Python 脚本（通用版本）
 * 根据需求文档动态生成分析代码模板
 */
export async function generatePythonScript(doc: RequirementDocument, outputPath: string): Promise<string> {
  const lines: string[] = [
    '#!/usr/bin/env python3',
    `# ${doc.title}`,
    `# Generated at ${new Date().toISOString()}`,
    '',
    'import pandas as pd',
    'import numpy as np',
    'from pathlib import Path',
    '',
    '# Input/output paths',
    `output_dir = Path("${outputPath}")`,
    'output_dir.mkdir(parents=True, exist_ok=True)',
    '',
  ];

  // 根据数据文件动态生成加载代码
  if (doc.datasets.length > 0) {
    lines.push('# Load data');
    for (const [i, ds] of doc.datasets.entries()) {
      const varName = `data_${i}`;
      // 解析实际文件路径
      const resolvedPath = await resolveActualFilePath(ds.file, doc.jobId);
      const safePath = (resolvedPath || ds.file).replace(/\\/g, '/');
      const ext = path.extname(ds.file).toLowerCase();
      
      if (ext === '.tsv') {
        lines.push(`${varName} = pd.read_csv("${safePath}", sep="\\t")`);
      } else if (['.xlsx', '.xls'].includes(ext)) {
        lines.push(`${varName} = pd.read_excel("${safePath}")`);
      } else {
        lines.push(`${varName} = pd.read_csv("${safePath}")`);
      }
    }
    lines.push('');
  }

  // 根据目标和分析方案生成步骤注释
  if (doc.goals.length > 0 || doc.analysisPlan.length > 0) {
    lines.push('# Analysis workflow');
    if (doc.goals.length > 0) {
      lines.push(`# Goals: ${doc.goals.join('; ')}`);
    }
    lines.push('');
    
    // 根据分析方案生成步骤
    for (const step of doc.analysisPlan) {
      lines.push(`# Step ${step.step}: ${step.description}`);
    }
    
    if (doc.analysisPlan.length === 0) {
      lines.push('# TODO: Add analysis steps based on your requirements');
    }
    lines.push('');
  }

  // 通用输出代码
  lines.push('# Save results');
  lines.push('# result.to_csv(output_dir / "result.csv", index=False)');
  lines.push('');
  lines.push('print("Analysis complete!")');
  
  return lines.join('\n');
}
