import OpenAI from 'openai';
import { config } from '../config.js';
import type { Skill } from '../skills/types.js';
import type { Agent, AgentCapabilities, AgentResponse, ConversationContext, Intent } from './types.js';

export abstract class BaseAgent implements Agent {
  abstract id: string;
  abstract name: string;
  abstract description: string;
  abstract capabilities: AgentCapabilities;

  protected readonly skills = new Map<string, Skill>();
  protected readonly openai = new OpenAI({
    apiKey: config.llm.apiKey || 'EMPTY',
    baseURL: config.llm.baseUrl,
  });

  registerSkill(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  abstract processMessage(message: string, context: ConversationContext): Promise<AgentResponse>;

  protected async analyzeIntent(message: string, context: ConversationContext): Promise<Intent> {
    const heuristicIntent = this.heuristicIntent(message, context);
    if (heuristicIntent.confidence >= 0.85 || !config.llm.apiKey) {
      return heuristicIntent;
    }

    const datasetNames = Array.from(context.datasets.values()).map((dataset) => dataset.name);
    const systemPrompt = `你是一个意图分类器。你只能返回 JSON，不要返回 Markdown。

候选意图：upload、explore、transform、merge、requirement、execute、question、unknown。

- upload: 上传或读取文件
- explore: 探索数据概览
- transform: 数据转换（过滤、标准化等）
- merge: 合并数据集
- requirement: 需求讨论（用户想讨论分析目标、方案）
- execute: 执行已确认的分析方案
- question: 关于数据的具体问题
- unknown: 无法识别

当前数据集：${datasetNames.length > 0 ? datasetNames.join(', ') : '无'}

返回格式：
{"type":"upload","confidence":0.95,"datasetId":null,"params":{}}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: config.llm.model,
        temperature: 0,
        max_tokens: 200,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
      });

      const raw = response.choices[0]?.message?.content || '';
      const jsonText = raw.replace(/^```json\s*/i, '').replace(/^```/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(jsonText) as Intent;
      return {
        type: parsed.type,
        confidence: parsed.confidence,
        datasetId: parsed.datasetId,
        params: parsed.params,
      };
    } catch {
      return heuristicIntent;
    }
  }

  protected async callLLM(prompt: string, context: ConversationContext): Promise<string> {
    if (!config.llm.apiKey) {
      return '当前未配置中转站 API，已回退到本地规则回答。';
    }

    try {
      const messages = context.messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      messages.push({ role: 'user' as const, content: prompt });

      const response = await this.openai.chat.completions.create({
        model: config.llm.model,
        messages,
        temperature: 0.2,
        max_tokens: 600,
      });

      return response.choices[0]?.message?.content || '我暂时没有拿到模型回复。';
    } catch {
      return '中转站 API 当前不可达，我先按现有数据元信息给出回答。';
    }
  }

  protected async callSkill(skillName: string, toolName: string, params: Record<string, unknown>): Promise<unknown> {
    const skill = this.skills.get(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }
    return skill.execute(toolName, params);
  }

  private heuristicIntent(message: string, context: ConversationContext): Intent {
    const normalized = message.toLowerCase();
    const hasDataset = context.datasets.size > 0;

    if (/上传|加载|读取|导入|file|csv|xlsx|xls|tsv/.test(message)) {
      return { type: 'upload', confidence: 0.95 };
    }

    if (/探索|预览|概览|统计|summary|describe/.test(message)) {
      return { type: 'explore', confidence: 0.92, datasetId: context.activeDatasetId };
    }

    if (/合并|merge|join/.test(normalized)) {
      return { type: 'merge', confidence: 0.9 };
    }

    if (/过滤|标准化|归一化|log2|transform|normalize|filter/.test(normalized)) {
      return { type: 'transform', confidence: 0.88, datasetId: context.activeDatasetId };
    }

    // 需求讨论相关意图
    if (/需求|目标|想做|分析方案|细胞类型|鉴定|单细胞|scRNA|表达矩阵/.test(message)) {
      return { type: 'requirement', confidence: 0.9 };
    }

    if (/执行|开始|run|execute|确认执行/.test(message)) {
      return { type: 'execute', confidence: 0.85 };
    }

    if (hasDataset && /多少行|几行|多少列|几列|列名|行数|列数/.test(message)) {
      return { type: 'question', confidence: 0.98, datasetId: context.activeDatasetId };
    }

    if (hasDataset) {
      return { type: 'question', confidence: 0.75, datasetId: context.activeDatasetId };
    }

    return { type: 'unknown', confidence: 0.4 };
  }
}
