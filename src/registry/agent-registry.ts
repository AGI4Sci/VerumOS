/**
 * Agent Registry - Agent 注册表
 *
 * 职责：
 * - 注册 Agent
 * - 意图 → Agent 映射
 * - 收集所有 Agent 的意图规则
 */

import type { Agent, Intent } from '../agents/types.js';
import type { IntentRule } from '../runtime/intent-classifier.js';

export interface AgentRegistration {
  agent: Agent;
  intentTypes: string[];
  intentRules: IntentRule[];
}

export class AgentRegistry {
  private agents = new Map<string, AgentRegistration>();
  private intentToAgent = new Map<string, string>();

  /**
   * 注册 Agent
   */
  register(
    agent: Agent,
    intentTypes: string[],
    intentRules: IntentRule[]
  ): void {
    const registration: AgentRegistration = {
      agent,
      intentTypes,
      intentRules,
    };

    this.agents.set(agent.id, registration);

    // 建立意图 → Agent 映射
    for (const intentType of intentTypes) {
      this.intentToAgent.set(intentType, agent.id);
    }
  }

  /**
   * 获取 Agent
   */
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId)?.agent;
  }

  /**
   * 根据意图获取 Agent
   */
  getAgentForIntent(intentType: string): Agent | undefined {
    const agentId = this.intentToAgent.get(intentType);
    if (!agentId) {
      return undefined;
    }
    return this.agents.get(agentId)?.agent;
  }

  /**
   * 获取所有意图类型
   */
  getAllIntentTypes(): string[] {
    const types = new Set<string>();
    for (const registration of this.agents.values()) {
      for (const type of registration.intentTypes) {
        types.add(type);
      }
    }
    return Array.from(types);
  }

  /**
   * 获取所有意图规则
   */
  getAllIntentRules(): IntentRule[] {
    const rules: IntentRule[] = [];
    for (const registration of this.agents.values()) {
      rules.push(...registration.intentRules);
    }
    return rules;
  }

  /**
   * 获取所有 Agent
   */
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values()).map((r) => r.agent);
  }

  /**
   * 检查 Agent 是否存在
   */
  hasAgent(agentId: string): boolean {
    return this.agents.has(agentId);
  }
}