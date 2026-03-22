/**
 * Data Agent - 声明式配置
 *
 * 不继承 runtime，只声明能力：
 * - systemPrompt
 * - tools
 * - convertToLlm
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { AgentConfig, AgentTool, AgentMessage } from '../runtime/agent-loop.js';
import type { AgentCapabilities, AgentResponse, ConversationContext, Dataset, DatasetColumn, DatasetMetadata, Intent, IntentRule, IntentType } from './types.js';
import { csvSkill } from '../skills/csv-skill.js';
import { bioinfoSkill } from '../skills/bioinfo-skill.js';
import {
  getRequirementDocument,
  createRequirementDocument,
  updateRequirementDocument,
  documentToMarkdown,
  generateToolChain,
} from './requirement-doc.js';
import { config } from '../config.js';

interface ReadResult extends DatasetMetadata {
  shape: { rows: number; columns: number };
  columns: DatasetColumn[];
  preview: Record<string, unknown>[];
}

/**
 * Data Agent 的意图规则
 * 声明式定义，便于扩展和维护
 */
const DATA_AGENT_INTENT_RULES: IntentRule[] = [
  {
    intent: 'upload' as IntentType,
    patterns: [/上传|加载|读取|导入|file|csv|xlsx|xls|tsv/i],
    confidence: 0.95,
    description: '上传或读取文件',
  },
  {
    intent: 'explore' as IntentType,
    patterns: [/探索|预览|概览|统计|summary|describe/i],
    confidence: 0.92,
    description: '探索数据概览',
  },
  {
    intent: 'merge' as IntentType,
    patterns: [/合并|merge|join/i],
    confidence: 0.9,
    description: '合并数据集',
  },
  {
    intent: 'transform' as IntentType,
    patterns: [/过滤|标准化|归一化|log2|transform|normalize|filter/i],
    confidence: 0.88,
    description: '数据转换',
  },
  {
    intent: 'requirement' as IntentType,
    patterns: [/需求|目标|想做|分析方案|细胞类型|鉴定|单细胞|scRNA|表达矩阵/i],
    confidence: 0.9,
    description: '需求讨论',
  },
  {
    intent: 'execute' as IntentType,
    patterns: [/执行|开始|run|execute|确认执行/i],
    confidence: 0.85,
    description: '执行分析方案',
  },
  {
    intent: 'question' as IntentType,
    patterns: [/多少行|几行|多少列|几列|列名|行数|列数/i],
    confidence: 0.98,
    description: '关于数据的具体问题',
  },
];

const DATA_AGENT_INTENT_TYPES = [
  'upload',
  'explore',
  'transform',
  'merge',
  'requirement',
  'execute',
  'question',
  'unknown',
];

/**
 * Data Agent 元数据
 */
export interface DataAgentMeta {
  id: string;
  name: string;
  description: string;
  capabilities: AgentCapabilities;
  intentTypes: string[];
  intentRules: IntentRule[];
}

/**
 * Data Agent 元数据
 */
export const dataAgentMeta: DataAgentMeta = {
  id: 'data-agent',
  name: 'Data Agent',
  description: '处理 CSV/Excel 数据的探索与问答，支持生物信息学分析',
  capabilities: {
    inputs: ['file', 'text'],
    outputs: ['dataset', 'summary'],
    skills: ['csv-skill', 'bioinfo-skill'],
  },
  intentTypes: DATA_AGENT_INTENT_TYPES,
  intentRules: DATA_AGENT_INTENT_RULES,
};

/**
 * Data Agent 系统提示
 */
export const dataAgentSystemPrompt = `你是一个数据分析助手，帮助用户探索和处理数据。

你可以：
- 读取 CSV、TSV、Excel 文件
- 探索数据概览（行数、列数、统计信息）
- 进行数据转换（过滤、标准化、log2）
- 合并多个数据集
- 讨论分析需求并生成工具链
- 执行已确认的分析方案

请根据用户的需求，选择合适的工具来完成任务。`;

/**
 * 消息转换函数
 * 过滤掉不需要发送给 LLM 的消息类型
 */
export function dataAgentConvertToLlm(messages: AgentMessage[]): AgentMessage[] {
  return messages.filter((m) =>
    ['user', 'assistant', 'system', 'tool'].includes(m.role)
  );
}

/**
 * 创建 Data Agent 的工具列表
 */
export function createDataAgentTools(
  context: ConversationContext
): AgentTool[] {
  return [
    {
      name: 'read_file',
      description: '读取 CSV/TSV/Excel 文件并返回基本概览',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
        },
        required: ['path'],
      },
      execute: async (params: Record<string, unknown>) => {
        const filePath = String(params.path || '');
        await fs.access(filePath);
        const result = (await csvSkill.execute('read_file', { path: filePath })) as ReadResult;
        const datasetId = uuidv4();
        const dataset: Dataset = {
          id: datasetId,
          name: path.basename(filePath),
          path: filePath,
          format: path.extname(filePath).toLowerCase(),
          skill: 'csv-skill',
          metadata: result,
        };
        context.datasets.set(datasetId, dataset);
        context.activeDatasetId = datasetId;
        return {
          datasetId,
          shape: result.shape,
          columns: result.columns.slice(0, 10),
          preview: result.preview,
        };
      },
    },
    {
      name: 'explore_data',
      description: '探索数据集，返回统计信息',
      parameters: {
        type: 'object',
        properties: {
          datasetId: { type: 'string', description: '数据集 ID' },
        },
        required: ['datasetId'],
      },
      execute: async (params: Record<string, unknown>) => {
        const datasetId = String(params.datasetId || context.activeDatasetId || '');
        const dataset = context.datasets.get(datasetId);
        if (!dataset) {
          throw new Error('数据集不存在');
        }
        const result = await csvSkill.execute('explore_data', { path: dataset.path });
        dataset.metadata = { ...dataset.metadata, ...result as DatasetMetadata };
        return result;
      },
    },
    {
      name: 'transform_data',
      description: '执行数据转换（filter、normalize、log2）',
      parameters: {
        type: 'object',
        properties: {
          datasetId: { type: 'string', description: '数据集 ID' },
          operation: { type: 'string', enum: ['filter', 'normalize', 'log2'] },
          params: { type: 'object' },
        },
        required: ['datasetId', 'operation'],
      },
      execute: async (params: Record<string, unknown>) => {
        const datasetId = String(params.datasetId || context.activeDatasetId || '');
        const dataset = context.datasets.get(datasetId);
        if (!dataset) {
          throw new Error('数据集不存在');
        }
        return csvSkill.execute('transform_data', {
          path: dataset.path,
          operation: params.operation,
          params: params.params || {},
        });
      },
    },
    {
      name: 'merge_data',
      description: '合并两个数据集',
      parameters: {
        type: 'object',
        properties: {
          leftDatasetId: { type: 'string' },
          rightDatasetId: { type: 'string' },
          on: { type: 'string', description: '合并键' },
          how: { type: 'string', enum: ['inner', 'left', 'right', 'outer'] },
        },
        required: ['leftDatasetId', 'rightDatasetId', 'on'],
      },
      execute: async (params: Record<string, unknown>) => {
        const leftDataset = context.datasets.get(String(params.leftDatasetId));
        const rightDataset = context.datasets.get(String(params.rightDatasetId));
        if (!leftDataset || !rightDataset) {
          throw new Error('数据集不存在');
        }
        return csvSkill.execute('merge_data', {
          paths: [leftDataset.path, rightDataset.path],
          on: params.on,
          how: params.how || 'inner',
        });
      },
    },
    {
      name: 'transpose',
      description: '矩阵转置',
      parameters: {
        type: 'object',
        properties: {
          datasetId: { type: 'string', description: '数据集 ID' },
        },
        required: ['datasetId'],
      },
      execute: async (params: Record<string, unknown>) => {
        const datasetId = String(params.datasetId || context.activeDatasetId || '');
        const dataset = context.datasets.get(datasetId);
        if (!dataset) {
          throw new Error('数据集不存在');
        }
        return csvSkill.execute('transpose', { path: dataset.path });
      },
    },
    {
      name: 'quality_control',
      description: '单细胞数据质量控制',
      parameters: {
        type: 'object',
        properties: {
          datasetId: { type: 'string' },
          minGenes: { type: 'number' },
          maxGenes: { type: 'number' },
          maxMitoPct: { type: 'number' },
        },
        required: ['datasetId'],
      },
      execute: async (params: Record<string, unknown>) => {
        const datasetId = String(params.datasetId || context.activeDatasetId || '');
        const dataset = context.datasets.get(datasetId);
        if (!dataset) {
          throw new Error('数据集不存在');
        }
        return bioinfoSkill.execute('quality_control', {
          path: dataset.path,
          min_genes: params.minGenes,
          max_genes: params.maxGenes,
          max_mito_pct: params.maxMitoPct,
        });
      },
    },
    {
      name: 'normalize_counts',
      description: '单细胞数据标准化',
      parameters: {
        type: 'object',
        properties: {
          datasetId: { type: 'string' },
          method: { type: 'string', enum: ['cpm', 'tpm', 'log1p', 'scanpy'] },
        },
        required: ['datasetId', 'method'],
      },
      execute: async (params: Record<string, unknown>) => {
        const datasetId = String(params.datasetId || context.activeDatasetId || '');
        const dataset = context.datasets.get(datasetId);
        if (!dataset) {
          throw new Error('数据集不存在');
        }
        return bioinfoSkill.execute('normalize_counts', {
          path: dataset.path,
          method: params.method,
        });
      },
    },
    {
      name: 'find_markers',
      description: '寻找 marker 基因',
      parameters: {
        type: 'object',
        properties: {
          datasetId: { type: 'string' },
          groupBy: { type: 'string' },
        },
        required: ['datasetId', 'groupBy'],
      },
      execute: async (params: Record<string, unknown>) => {
        const datasetId = String(params.datasetId || context.activeDatasetId || '');
        const dataset = context.datasets.get(datasetId);
        if (!dataset) {
          throw new Error('数据集不存在');
        }
        return bioinfoSkill.execute('find_markers', {
          path: dataset.path,
          group_by: params.groupBy,
        });
      },
    },
  ];
}

/**
 * 创建 Data Agent 配置
 */
export function createDataAgentConfig(context: ConversationContext): AgentConfig {
  return {
    id: dataAgentMeta.id,
    name: dataAgentMeta.name,
    systemPrompt: dataAgentSystemPrompt,
    tools: createDataAgentTools(context),
    convertToLlm: dataAgentConvertToLlm,
  };
}

/**
 * Data Agent 处理器
 *
 * 保留原有的业务逻辑处理方法，用于非工具调用的场景
 */
export class DataAgentProcessor {
  /**
   * 获取意图类型列表
   */
  getIntentTypes(): string[] {
    return DATA_AGENT_INTENT_TYPES;
  }

  /**
   * 获取意图规则
   */
  getIntentRules(): IntentRule[] {
    return DATA_AGENT_INTENT_RULES;
  }

  /**
   * 处理消息
   */
  async processMessage(message: string, context: ConversationContext): Promise<AgentResponse> {
    const intent = await this.analyzeIntent(message, context);
    context.currentIntent = intent;

    switch (intent.type) {
      case 'upload':
        return this.handleUpload(message, context);
      case 'explore':
        return this.handleExplore(context, intent);
      case 'transform':
        return this.handleTransform(context, intent);
      case 'merge':
        return this.handleMerge(context, intent);
      case 'requirement':
        return this.handleRequirementDiscuss(message, context);
      case 'execute':
        return this.handleExecute(context);
      case 'question':
        return this.handleQuestion(message, context, intent);
      default:
        return {
          type: 'text',
          content: '我现在主要支持数据上传、数据概览、需求讨论，以及像"这份数据有多少行？"这样的问答。',
        };
    }
  }

  /**
   * 意图分析（使用声明的规则）
   */
  private async analyzeIntent(message: string, context: ConversationContext): Promise<Intent> {
    // 1. 使用声明的规则进行启发式匹配
    const heuristicIntent = this.heuristicIntent(message, context);
    return heuristicIntent;
  }

  /**
   * 启发式意图匹配（使用声明的规则）
   */
  private heuristicIntent(message: string, context: ConversationContext): Intent {
    const hasDataset = context.datasets.size > 0;

    // 使用声明的规则匹配
    for (const rule of DATA_AGENT_INTENT_RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(message)) {
          return {
            type: rule.intent as IntentType,
            confidence: rule.confidence ?? 0.9,
            datasetId: context.activeDatasetId,
          };
        }
      }
    }

    // 如果有数据集但没有匹配到具体意图，默认为 question
    if (hasDataset) {
      return {
        type: 'question',
        confidence: 0.75,
        datasetId: context.activeDatasetId,
      };
    }

    return { type: 'unknown', confidence: 0.4 };
  }

  async ingestFile(filePath: string, context: ConversationContext, displayName?: string): Promise<AgentResponse> {
    await fs.access(filePath);
    const result = (await csvSkill.execute('read_file', { path: filePath })) as ReadResult;
    const datasetId = uuidv4();
    const dataset: Dataset = {
      id: datasetId,
      name: displayName || path.basename(filePath),
      path: filePath,
      format: path.extname(filePath).toLowerCase(),
      skill: 'csv-skill',
      metadata: result,
    };

    context.datasets.set(datasetId, dataset);
    context.activeDatasetId = datasetId;

    const previewColumns = result.columns.slice(0, 6).map((column) => `${column.name} (${column.type})`).join('，');
    return {
      type: 'result',
      content: `已接收数据集 \`${dataset.name}\`。\n\n- 行数：${result.shape.rows}\n- 列数：${result.shape.columns}\n- 前几列：${previewColumns || '暂无'}\n\n你可以继续问我：这份数据有多少行？或者：探索这份数据。`,
      result: {
        datasetId,
        dataset,
        preview: result.preview,
      },
    };
  }

  private async handleUpload(message: string, context: ConversationContext): Promise<AgentResponse> {
    const match = message.match(/([\w./\\-]+\.(?:csv|tsv|xlsx|xls))/i);
    const filePath = match?.[1];
    if (!filePath) {
      return {
        type: 'text',
        content: '请上传文件，或直接告诉我 `data/xxx.csv` 这样的路径。',
      };
    }

    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
    return this.ingestFile(absolutePath, context, path.basename(absolutePath));
  }

  private async handleExplore(context: ConversationContext, intent: Intent): Promise<AgentResponse> {
    const dataset = this.getCurrentDataset(context, intent.datasetId);
    if (!dataset) {
      return { type: 'text', content: '请先上传一份 CSV 或 Excel 文件。' };
    }

    const result = (await csvSkill.execute('explore_data', { path: dataset.path })) as DatasetMetadata;
    dataset.metadata = { ...dataset.metadata, ...result };
    const rows = result.shape?.rows ?? '未知';
    const columns = result.shape?.columns ?? '未知';
    const missingColumns = Object.entries(result.missing || {}).filter(([, count]) => count > 0).length;
    const duplicates = result.quality?.duplicates ?? 0;

    return {
      type: 'result',
      content: `数据探索完成：\`${dataset.name}\`\n\n- 行数：${rows}\n- 列数：${columns}\n- 含缺失值的列数：${missingColumns}\n- 重复行：${duplicates}`,
      result,
    };
  }

  private async handleTransform(context: ConversationContext, intent: Intent): Promise<AgentResponse> {
    const dataset = this.getCurrentDataset(context, intent.datasetId);
    if (!dataset) {
      return { type: 'text', content: '请先上传一份数据。' };
    }

    const operation = String(intent.params?.operation || 'normalize');
    const result = await csvSkill.execute('transform_data', {
      path: dataset.path,
      operation,
      params: intent.params || {},
    });

    return {
      type: 'result',
      content: `已完成数据转换：${operation}`,
      result,
    };
  }

  private async handleMerge(context: ConversationContext, intent: Intent): Promise<AgentResponse> {
    const datasets = Array.from(context.datasets.values());
    if (datasets.length < 2) {
      return {
        type: 'text',
        content: '当前只有一份数据，合并至少需要两份数据集。',
      };
    }

    const mergeKey = String(intent.params?.on || '');
    const leftColumns = (datasets[0].metadata?.columns || []).map((column) => column.name);
    const rightColumns = (datasets[1].metadata?.columns || []).map((column) => column.name);
    const common = leftColumns.filter((column) => rightColumns.includes(column));

    if (!mergeKey) {
      if (common.length === 0) {
        return {
          type: 'text',
          content: '我没有找到公共列，请明确告诉我合并键。',
        };
      }
      return {
        type: 'question',
        content: `我发现这些公共列可用于合并：${common.join('、')}`,
        questions: [
          {
            id: 'merge_key',
            text: '请选择合并列',
            options: common.slice(0, 5).map((column) => ({ label: column, value: column })),
          },
        ],
      };
    }

    const result = await csvSkill.execute('merge_data', {
      paths: datasets.slice(0, 2).map((dataset) => dataset.path),
      on: mergeKey,
      how: String(intent.params?.how || 'inner'),
    });

    return {
      type: 'result',
      content: `已完成数据合并，合并键为 \`${mergeKey}\`。`,
      result,
    };
  }

  private async handleQuestion(message: string, context: ConversationContext, intent: Intent): Promise<AgentResponse> {
    const dataset = this.getCurrentDataset(context, intent.datasetId);
    if (!dataset) {
      return {
        type: 'text',
        content: '请先上传一份数据文件，我再回答具体问题。',
      };
    }

    const quickAnswer = this.answerWithMetadata(message, dataset.metadata);
    if (quickAnswer) {
      return { type: 'text', content: quickAnswer };
    }

    return {
      type: 'text',
      content: '我暂时无法回答这个问题，请尝试更具体的描述。',
    };
  }

  private async handleRequirementDiscuss(message: string, context: ConversationContext): Promise<AgentResponse> {
    let doc = await getRequirementDocument(context.sessionId);

    if (!doc) {
      // 检查是否有初始需求文档
      try {
        const initialDocPath = path.resolve(config.data.dir, '需求文档_单细胞分析.md');
        const initialContent = await fs.readFile(initialDocPath, 'utf-8');
        doc = await createRequirementDocument(context.sessionId, '单细胞分析需求');
        const { parseMarkdownToDocument } = await import('./requirement-doc.js');
        const parsed = parseMarkdownToDocument(initialContent);
        Object.assign(doc, parsed);
        await updateRequirementDocument(context.sessionId, doc);
      } catch {
        doc = await createRequirementDocument(context.sessionId, '需求文档');
      }
    }

    // 更新需求文档状态
    if (doc.status === 'draft') {
      await updateRequirementDocument(context.sessionId, { status: 'discussing' });
    }

    // 构建讨论提示
    const docMarkdown = documentToMarkdown(doc);

    return {
      type: 'result',
      content: `当前需求文档：\n\n${docMarkdown}\n\n请告诉我您的分析需求。`,
      result: {
        requirementDocument: doc,
        markdown: docMarkdown,
        toolChain: generateToolChain(doc),
      },
    };
  }

  private async handleExecute(context: ConversationContext): Promise<AgentResponse> {
    const doc = await getRequirementDocument(context.sessionId);

    if (!doc || doc.status !== 'confirmed') {
      return {
        type: 'text',
        content: '请先确认需求文档后再执行。你可以说"我想做细胞类型鉴定"来开始需求讨论。',
      };
    }

    const toolChain = generateToolChain(doc);
    if (toolChain.length === 0) {
      return {
        type: 'text',
        content: '未找到可执行的工具链，请检查需求文档中的数据源配置。',
      };
    }

    // 更新状态为执行中
    await updateRequirementDocument(context.sessionId, { status: 'executing' });

    const results: Array<{ step: number; tool: string; success: boolean; message: string }> = [];

    for (let i = 0; i < toolChain.length; i++) {
      const step = toolChain[i];
      try {
        const skill = step.skill === 'csv-skill' ? csvSkill : bioinfoSkill;
        const result = await skill.execute(step.tool, step.params);
        results.push({
          step: i + 1,
          tool: `${step.skill}.${step.tool}`,
          success: true,
          message: JSON.stringify(result).slice(0, 200),
        });
      } catch (error) {
        results.push({
          step: i + 1,
          tool: `${step.skill}.${step.tool}`,
          success: false,
          message: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }

    const allSuccess = results.every((r) => r.success);
    if (allSuccess) {
      await updateRequirementDocument(context.sessionId, { status: 'completed' });
    }

    const summary = results
      .map((r) => `${r.step}. ${r.tool}: ${r.success ? '✓ 成功' : `✗ 失败: ${r.message}`}`)
      .join('\n');

    return {
      type: 'result',
      content: allSuccess ? `执行完成！\n\n${summary}` : `执行过程中遇到问题：\n\n${summary}`,
      result: { results, toolChain },
    };
  }

  private getCurrentDataset(context: ConversationContext, datasetId?: string): Dataset | undefined {
    if (datasetId && context.datasets.has(datasetId)) {
      return context.datasets.get(datasetId);
    }
    if (context.activeDatasetId) {
      return context.datasets.get(context.activeDatasetId);
    }
    return Array.from(context.datasets.values()).at(-1);
  }

  private answerWithMetadata(message: string, metadata?: DatasetMetadata): string | null {
    if (!metadata?.shape) {
      return null;
    }

    if (/多少行|几行|行数/.test(message)) {
      return `这份数据共有 ${metadata.shape.rows} 行。`;
    }

    if (/多少列|几列|列数/.test(message)) {
      return `这份数据共有 ${metadata.shape.columns} 列。`;
    }

    if (/列名|有哪些列/.test(message)) {
      const columns = (metadata.columns || []).slice(0, 20).map((column) => column.name).join('、');
      return columns ? `前面的列包括：${columns}` : '我暂时没有列名信息。';
    }

    return null;
  }
}

/**
 * Data Agent 处理器实例
 */
export const dataAgentProcessor = new DataAgentProcessor();

/**
 * 向后兼容：导出 dataAgent
 */
export const dataAgent = {
  id: dataAgentMeta.id,
  name: dataAgentMeta.name,
  description: dataAgentMeta.description,
  capabilities: dataAgentMeta.capabilities,
  getIntentTypes: () => dataAgentMeta.intentTypes,
  getIntentRules: () => dataAgentMeta.intentRules,
  processMessage: (message: string, context: ConversationContext) =>
    dataAgentProcessor.processMessage(message, context),
};