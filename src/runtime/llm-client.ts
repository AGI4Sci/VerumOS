/**
 * LLM Client - LLM 调用抽象层
 */

import OpenAI from 'openai';
import type { ConversationContext, Intent } from '../agents/types.js';

export interface LLMClientConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class LLMClient {
  private openai: OpenAI | null = null;
  private model: string;

  constructor(config: LLMClientConfig) {
    this.model = config.model;
    if (config.apiKey) {
      this.openai = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
    }
  }

  /**
   * 检查 LLM 是否可用
   */
  isAvailable(): boolean {
    return this.openai !== null;
  }

  /**
   * 意图分类
   */
  async classifyIntent(
    message: string,
    context: ConversationContext,
    intentTypes: string[]
  ): Promise<Intent | null> {
    if (!this.openai) {
      return null;
    }

    const datasetNames = Array.from(context.datasets.values()).map(
      (dataset) => dataset.name
    );

    const systemPrompt = `你是一个意图分类器。你只能返回 JSON，不要返回 Markdown。

候选意图：${intentTypes.join('、')}。

当前数据集：${datasetNames.length > 0 ? datasetNames.join(', ') : '无'}

返回格式：
{"type":"<意图类型>","confidence":0.95,"datasetId":null,"params":{}}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0,
        max_tokens: 200,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
      });

      const raw = response.choices[0]?.message?.content || '';
      const jsonText = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```/, '')
        .replace(/```$/, '')
        .trim();
      const parsed = JSON.parse(jsonText) as Intent;
      return {
        type: parsed.type,
        confidence: parsed.confidence,
        datasetId: parsed.datasetId,
        params: parsed.params,
      };
    } catch {
      return null;
    }
  }

  /**
   * 通用 LLM 调用
   */
  async chat(prompt: string, context: ConversationContext): Promise<string> {
    if (!this.openai) {
      return '当前未配置 LLM API，已回退到本地规则回答。';
    }

    try {
      const messages = context.messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      messages.push({ role: 'user' as const, content: prompt });

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.2,
        max_tokens: 600,
      });

      return response.choices[0]?.message?.content || '我暂时没有拿到模型回复。';
    } catch {
      return 'LLM API 当前不可达，我先按现有数据元信息给出回答。';
    }
  }
}