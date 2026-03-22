import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { BaseAgent } from './base.js';
import type { AgentCapabilities, AgentResponse, ConversationContext, Dataset, DatasetColumn, DatasetMetadata, Intent } from './types.js';
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

export class DataAgent extends BaseAgent {
  id = 'data-agent';
  name = 'Data Agent';
  description = '处理 CSV/Excel 数据的探索与问答，支持生物信息学分析';

  capabilities: AgentCapabilities = {
    inputs: ['file', 'text'],
    outputs: ['dataset', 'summary'],
    skills: ['csv-skill', 'bioinfo-skill'],
  };

  constructor() {
    super();
    this.registerSkill(csvSkill);
    this.registerSkill(bioinfoSkill);
  }

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
          content: '我现在主要支持数据上传、数据概览、需求讨论，以及像”这份数据有多少行？”这样的问答。',
        };
    }
  }

  async ingestFile(filePath: string, context: ConversationContext, displayName?: string): Promise<AgentResponse> {
    await fs.access(filePath);
    const result = (await this.callSkill('csv-skill', 'read_file', { path: filePath })) as ReadResult;
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

    const result = (await this.callSkill('csv-skill', 'explore_data', { path: dataset.path })) as DatasetMetadata;
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
    const result = await this.callSkill('csv-skill', 'transform_data', {
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

    const result = await this.callSkill('csv-skill', 'merge_data', {
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

    const prompt = `当前数据集名称：${dataset.name}
行数：${dataset.metadata?.shape?.rows ?? '未知'}
列数：${dataset.metadata?.shape?.columns ?? '未知'}
列名：${(dataset.metadata?.columns || []).slice(0, 20).map((column) => column.name).join(', ')}

请基于这些元信息回答用户问题：${message}`;
    const reply = await this.callLLM(prompt, context);
    return { type: 'text', content: reply };
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
    const prompt = `你是一个科研数据分析助手，正在与用户讨论分析需求。

当前需求文档：
${docMarkdown}

用户说：${message}

请根据用户输入更新需求理解，并提问以澄清不明确的部分。如果用户确认了方案，请明确说明"方案已确认，可以开始执行"。

回复格式：
1. 确认理解的内容
2. 提出澄清问题（如有）
3. 更新后的需求摘要`;

    const reply = await this.callLLM(prompt, context);

    // 检查是否确认方案
    if (/方案已确认|可以开始执行|确认执行/i.test(reply)) {
      await updateRequirementDocument(context.sessionId, { status: 'confirmed' });
    }

    return {
      type: 'result',
      content: reply,
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
        const result = await this.callSkill(step.skill, step.tool, step.params);
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

export const dataAgent = new DataAgent();
