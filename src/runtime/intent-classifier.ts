/**
 * Intent Classifier - 意图分类器
 *
 * 支持两种分类方式：
 * 1. 启发式规则匹配（快速、低成本）
 * 2. LLM 分类（更准确、有成本）
 */

import type { Intent, IntentType, ConversationContext } from '../agents/types.js';
import type { LLMClient } from './llm-client.js';

export interface IntentRule {
  intent: IntentType | string;
  patterns: RegExp[];
  confidence?: number;
  description?: string;
}

export interface IntentClassifierConfig {
  rules: IntentRule[];
  llmClient?: LLMClient;
  llmThreshold?: number; // 启发式置信度低于此值时调用 LLM
}

export class IntentClassifier {
  private rules: IntentRule[];
  private llmClient?: LLMClient;
  private llmThreshold: number;

  constructor(config: IntentClassifierConfig) {
    this.rules = config.rules;
    this.llmClient = config.llmClient;
    this.llmThreshold = config.llmThreshold ?? 0.85;
  }

  /**
   * 添加意图规则
   */
  addRule(rule: IntentRule): void {
    this.rules.push(rule);
  }

  /**
   * 获取所有规则
   */
  getRules(): IntentRule[] {
    return [...this.rules];
  }

  /**
   * 分类意图
   */
  async classify(
    message: string,
    context: ConversationContext,
    availableIntents?: string[]
  ): Promise<Intent> {
    // 1. 启发式匹配
    const heuristicResult = this.heuristicMatch(message, context);
    if (heuristicResult.confidence >= this.llmThreshold) {
      return heuristicResult;
    }

    // 2. LLM 分类
    if (this.llmClient?.isAvailable() && availableIntents) {
      const llmResult = await this.llmClient.classifyIntent(
        message,
        context,
        availableIntents
      );
      if (llmResult) {
        return llmResult;
      }
    }

    return heuristicResult;
  }

  /**
   * 启发式匹配
   */
  private heuristicMatch(
    message: string,
    context: ConversationContext
  ): Intent {
    const hasDataset = context.datasets.size > 0;

    for (const rule of this.rules) {
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

    return {
      type: 'unknown',
      confidence: 0.4,
    };
  }
}