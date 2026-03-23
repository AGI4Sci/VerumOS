/**
 * Agent Registry - Agent 注册表
 *
 * 职责：
 * - 注册 Agent（兼容旧版 Agent 和新版 AgentDef）
 * - 意图 → Agent 映射
 * - 收集所有 Agent 的路由规则
 */

import type { Agent, Intent } from '../agents/types.js';
import type { IntentRule } from '../runtime/intent-classifier.js';
import type { AgentDef, RouteRule } from '../core/types.js';

/**
 * 路由规则条目（带 agentId）
 */
export interface RouteRuleEntry {
  agentId: string;
  rule: RouteRule;
}

export interface AgentRegistration {
  agent: Agent;
  intentTypes: string[];
  intentRules: IntentRule[];
}

export class AgentRegistry {
  // 旧版 Agent 注册
  private agents = new Map<string, AgentRegistration>();
  private intentToAgent = new Map<string, string>();
  
  // 新版 AgentDef 注册
  private agentDefs = new Map<string, AgentDef>();

  /**
   * 注册 Agent（旧版接口）
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
   * 注册 AgentDef（新版接口）
   */
  registerDef(agentDef: AgentDef): void {
    this.agentDefs.set(agentDef.id, agentDef);
  }

  /**
   * 获取 Agent（旧版）
   */
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId)?.agent;
  }

  /**
   * 获取 AgentDef（新版）
   */
  get(agentId: string): AgentDef | undefined {
    // 优先返回新版 AgentDef
    if (this.agentDefs.has(agentId)) {
      return this.agentDefs.get(agentId);
    }
    
    // 兼容旧版：从 Agent 构造 AgentDef
    const registration = this.agents.get(agentId);
    if (registration) {
      return this.agentToDef(registration);
    }
    
    return undefined;
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
   * 获取所有 Agent（旧版）
   */
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values()).map((r) => r.agent);
  }

  /**
   * 获取所有 AgentDef（新版）
   */
  getAll(): AgentDef[] {
    // 合并新版和旧版
    const defs: AgentDef[] = [];
    
    for (const def of this.agentDefs.values()) {
      defs.push(def);
    }
    
    for (const registration of this.agents.values()) {
      if (!this.agentDefs.has(registration.agent.id)) {
        defs.push(this.agentToDef(registration));
      }
    }
    
    return defs;
  }

  /**
   * 获取所有路由规则（用于 Router）
   */
  getAllRoutes(): RouteRuleEntry[] {
    const entries: RouteRuleEntry[] = [];
    
    // 从新版 AgentDef 收集
    for (const def of this.agentDefs.values()) {
      if (def.routes) {
        for (const rule of def.routes) {
          entries.push({ agentId: def.id, rule });
        }
      }
    }
    
    // 从旧版 Agent 收集（转换意图规则为路由规则）
    for (const registration of this.agents.values()) {
      const agentId = registration.agent.id;
      
      // 如果新版已经有这个 Agent 的路由规则，跳过
      if (this.agentDefs.has(agentId) && this.agentDefs.get(agentId)?.routes) {
        continue;
      }
      
      // 将意图规则转换为路由规则
      for (const intentRule of registration.intentRules) {
        entries.push({
          agentId,
          rule: {
            match: { pattern: intentRule.patterns?.[0] },
            priority: intentRule.confidence ? intentRule.confidence * 10 : 5,
          },
        });
      }
    }
    
    return entries;
  }

  /**
   * 检查 Agent 是否存在
   */
  hasAgent(agentId: string): boolean {
    return this.agents.has(agentId) || this.agentDefs.has(agentId);
  }

  /**
   * 将旧版 Agent 转换为 AgentDef
   */
  private agentToDef(registration: AgentRegistration): AgentDef {
    const agent = registration.agent;
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      systemPrompt: '', // 旧版 Agent 没有这个字段
      skills: agent.capabilities?.skills || [],
      routes: registration.intentRules.map((rule) => ({
        match: { pattern: rule.patterns?.[0] },
        priority: rule.confidence ? rule.confidence * 10 : 5,
      })),
    };
  }
}