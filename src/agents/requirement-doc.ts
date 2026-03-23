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
  updatedAt: string;
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

  // 解析数据源表格
  const dataSection = markdown.match(/##\s*数据源?\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (dataSection) {
    const tableRows = dataSection[1].match(/\|.+\|/g);
    if (tableRows && tableRows.length > 2) {
      result.datasets = tableRows.slice(2).map((row) => {
        const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
        return {
          file: cells[0] || '',
          type: cells[1] || '',
          description: cells[2] || '',
        };
      });
    }
  }

  // 解析目标
  const goalSection = markdown.match(/##\s*目标\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (goalSection) {
    const goals = goalSection[1]
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);
    result.goals = goals;
  }

  // 解析分析方案
  const planSection = markdown.match(/##\s*分析方案\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (planSection) {
    const steps = planSection[1]
      .split('\n')
      .filter((line) => /^\d+\./.test(line.trim()))
      .map((line, index) => ({
        step: index + 1,
        description: line.replace(/^\d+\.\s*/, '').trim(),
        status: 'pending' as const,
      }));
    result.analysisPlan = steps;
  }

  // 解析状态
  const statusMatch = markdown.match(/##\s*状态\s*\n([\s\S]*?)(?=\n##|$)/i);
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

  // 原始内容（如果有额外内容）
  if (doc.content && !lines.includes(doc.content)) {
    lines.push('---');
    lines.push('');
    lines.push(doc.content);
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

export function generateToolChain(doc: RequirementDocument): Array<{ skill: string; tool: string; params: Record<string, unknown> }> {
  const chain: Array<{ skill: string; tool: string; params: Record<string, unknown> }> = [];

  // 根据数据类型和分析方案生成工具链
  for (const ds of doc.datasets) {
    const ext = path.extname(ds.file).toLowerCase();

    // 判断是否为表达矩阵
    const isExpressionMatrix = /表达矩阵|expression|count|matrix/i.test(ds.description) ||
      /count_matrix|expression_matrix/i.test(ds.file);

    if (isExpressionMatrix) {
      chain.push({
        skill: 'bioinfo-skill',
        tool: 'read_expression_matrix',
        params: { path: ds.file },
      });
    } else if (['.csv', '.tsv', '.xlsx', '.xls'].includes(ext)) {
      chain.push({
        skill: 'csv-skill',
        tool: 'read_file',
        params: { path: ds.file },
      });
    }
  }

  // 根据目标添加分析步骤
  const goals = doc.goals.join(' ').toLowerCase();

  if (/细胞类型|cell.type|鉴定/i.test(goals)) {
    chain.push({
      skill: 'bioinfo-skill',
      tool: 'quality_control',
      params: { path: doc.datasets[0]?.file || '' },
    });
    chain.push({
      skill: 'bioinfo-skill',
      tool: 'normalize_counts',
      params: { path: doc.datasets[0]?.file || '', method: 'scanpy' },
    });
    chain.push({
      skill: 'bioinfo-skill',
      tool: 'find_markers',
      params: { path: doc.datasets[0]?.file || '' },
    });
  }

  return chain;
}