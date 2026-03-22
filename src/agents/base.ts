/**
 * BaseAgent - Agent 工具类
 *
 * 不再作为基类使用，只提供通用的工具方法。
 * Agent 应该使用声明式配置，通过 runtime/agent-loop 执行。
 *
 * @deprecated 请使用 runtime/agent-loop.ts 中的 agentLoop
 */

import OpenAI from 'openai';
import { config } from '../config.js';
import type { Skill } from '../skills/types.js';
import type { Agent, AgentCapabilities, AgentResponse, ConversationContext } from './types.js';

/**
 * Agent 工具类
 *
 * 提供通用的 LLM 和 Skill 调用方法。
 * 不建议继承此类，建议使用声明式配置。
 *
 * @deprecated 请使用声明式配置
 */
export abstract class BaseAgent implements Agent {
  abstract id: string;
  abstract name: string;
  abstract description: string;
  abstract capabilities: AgentCapabilities;

  protected readonly skills = new Map<string, Skill>();
  protected readonly openai: OpenAI | null;

  constructor() {
    if (config.llm.apiKey) {
      this.openai = new OpenAI({
        apiKey: config.llm.apiKey,
        baseURL: config.llm.baseUrl,
      });
    } else {
      this.openai = null;
    }
  }

  /**
   * 注册 Skill
   */
  registerSkill(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  /**
   * 处理消息（由子类实现）
   */
  abstract processMessage(message: string, context: ConversationContext): Promise<AgentResponse>;

  /**
   * 调用 LLM
   */
  protected async callLLM(prompt: string, context: ConversationContext): Promise<string> {
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
        model: config.llm.model,
        messages,
        temperature: 0.2,
        max_tokens: 600,
      });

      return response.choices[0]?.message?.content || '我暂时没有拿到模型回复。';
    } catch {
      return 'LLM API 当前不可达，我先按现有数据元信息给出回答。';
    }
  }

  /**
   * 调用 Skill
   */
  protected async callSkill(skillName: string, toolName: string, params: Record<string, unknown>): Promise<unknown> {
    const skill = this.skills.get(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }
    return skill.execute(toolName, params);
  }

  /**
   * 检查 LLM 是否可用
   */
  protected isLLMAvailable(): boolean {
    return this.openai !== null;
  }
}

/**
 * 创建 LLM 客户端
 *
 * 用于创建独立的 LLM 客户端，不需要继承 BaseAgent。
 */
export function createLLMClient(): OpenAI | null {
  if (!config.llm.apiKey) {
    return null;
  }
  return new OpenAI({
    apiKey: config.llm.apiKey,
    baseURL: config.llm.baseUrl,
  });
}

/**
 * 调用 LLM（独立函数）
 */
export async function callLLM(
  openai: OpenAI | null,
  prompt: string,
  context: ConversationContext
): Promise<string> {
  if (!openai) {
    return '当前未配置 LLM API，已回退到本地规则回答。';
  }

  try {
    const messages = context.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    messages.push({ role: 'user' as const, content: prompt });

    const response = await openai.chat.completions.create({
      model: config.llm.model,
      messages,
      temperature: 0.2,
      max_tokens: 600,
    });

    return response.choices[0]?.message?.content || '我暂时没有拿到模型回复。';
  } catch {
    return 'LLM API 当前不可达，我先按现有数据元信息给出回答。';
  }
}