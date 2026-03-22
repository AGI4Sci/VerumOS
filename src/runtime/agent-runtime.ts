/**
 * Agent Runtime - 核心执行引擎
 *
 * 职责：
 * - 对话状态管理
 * - 意图识别（委托给注册的分类器）
 * - 工具调用编排
 * - Agent 路由
 */

import type { LLMClient } from './llm-client.js';
import type { AgentRegistry } from '../registry/agent-registry.js';
import type { SkillRegistry } from '../registry/skill-registry.js';
import type { ConversationContext, Intent, IntentType, AgentResponse } from '../agents/types.js';

export interface RuntimeConfig {
  llmClient: LLMClient;
  agentRegistry: AgentRegistry;
  skillRegistry: SkillRegistry;
}

export class AgentRuntime {
  constructor(private config: RuntimeConfig) {}

  /**
   * 处理用户消息
   */
  async processMessage(
    message: string,
    context: ConversationContext
  ): Promise<AgentResponse> {
    // 1. 意图识别（使用注册的分类器）
    const intent = await this.classifyIntent(message, context);
    context.currentIntent = intent;

    // 2. 找到对应的 Agent
    const agent = this.config.agentRegistry.getAgentForIntent(intent.type);
    if (!agent) {
      return {
        type: 'text',
        content: '我暂时无法处理这个请求，请稍后再试。',
      };
    }

    // 3. 执行 Agent 的 handler
    return agent.processMessage(message, context);
  }

  /**
   * 意图分类
   * 优先使用启发式规则，置信度不足时调用 LLM
   */
  private async classifyIntent(
    message: string,
    context: ConversationContext
  ): Promise<Intent> {
    // 1. 收集所有 Agent 的意图规则
    const allRules = this.config.agentRegistry.getAllIntentRules();

    // 2. 启发式匹配
    for (const rule of allRules) {
      for (const pattern of rule.patterns) {
        if (pattern.test(message)) {
          return {
            type: rule.intent as IntentType,
            confidence: rule.confidence || 0.9,
            datasetId: context.activeDatasetId,
          };
        }
      }
    }

    // 3. 如果有 LLM，使用 LLM 分类
    if (this.config.llmClient.isAvailable()) {
      try {
        const intentTypes = this.config.agentRegistry.getAllIntentTypes();
        const llmIntent = await this.config.llmClient.classifyIntent(
          message,
          context,
          intentTypes
        );
        if (llmIntent && llmIntent.confidence >= 0.7) {
          return llmIntent;
        }
      } catch {
        // LLM 分类失败，继续使用默认
      }
    }

    // 4. 默认返回 unknown
    return {
      type: 'unknown',
      confidence: 0.4,
    };
  }

  /**
   * 调用 Skill
   */
  async callSkill(
    skillName: string,
    toolName: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const skill = this.config.skillRegistry.getSkill(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }
    return skill.execute(toolName, params);
  }
}