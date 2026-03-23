/**
 * Router - 两级路由器
 *
 * 职责：
 * - 规则路由（第一级）：从所有 AgentDef.routes 汇总规则进行匹配
 * - LLM 语义路由（第二级）：使用 LLM 判断用户意图属于哪个 Agent
 * - Session 级路由锁定：session 确定 agent 后，后续轮次默认复用
 */

import type { 
  AgentDef, 
  RouteRule, 
  RouterResult, 
  SessionContext,
  LLMClient,
  Message,
} from './types.js';
import type { RouteRuleEntry } from '../registry/agent-registry.js';

/**
 * Router 配置
 */
export interface RouterConfig {
  agentRegistry: AgentRegistryInterface;
  llmClient: LLMClient;
  defaultAgentId?: string;
  enableLlmRouting?: boolean;
}

/**
 * AgentRegistry 接口（简化版，用于 Router）
 */
export interface AgentRegistryInterface {
  get(agentId: string): AgentDef | undefined;
  getAll(): AgentDef[];
  getAllRoutes(): RouteRuleEntry[];
}

/**
 * Router 实现
 */
export class Router {
  private agentRegistry: AgentRegistryInterface;
  private llmClient: LLMClient;
  private defaultAgentId: string;
  private enableLlmRouting: boolean;

  constructor(config: RouterConfig) {
    this.agentRegistry = config.agentRegistry;
    this.llmClient = config.llmClient;
    this.defaultAgentId = config.defaultAgentId || 'data-agent';
    this.enableLlmRouting = config.enableLlmRouting ?? true;
  }

  /**
   * 路由用户消息到合适的 Agent
   *
   * 流程：
   * 1. 规则路由 → 命中则返回
   * 2. LLM 语义路由 → 命中则返回
   * 3. 返回默认 Agent
   */
  async route(message: string, session?: SessionContext): Promise<RouterResult> {
    // 1. 规则路由
    const ruleResult = this.ruleRoute(message, session);
    if (ruleResult) {
      return ruleResult;
    }

    // 2. LLM 语义路由
    if (this.enableLlmRouting && this.llmClient.isAvailable()) {
      const llmResult = await this.llmRoute(message);
      if (llmResult) {
        return llmResult;
      }
    }

    // 3. 返回默认 Agent
    return {
      agentId: this.defaultAgentId,
      matchedBy: 'default',
    };
  }

  /**
   * 规则路由（第一级）
   *
   * 从所有 AgentDef.routes 汇总规则，按优先级匹配
   */
  private ruleRoute(message: string, session?: SessionContext): RouterResult | null {
    const entries = this.agentRegistry.getAllRoutes();

    // 按优先级排序（高优先级在前）
    const sorted = [...entries].sort((a, b) => {
      const pa = a.rule.priority ?? 0;
      const pb = b.rule.priority ?? 0;
      return pb - pa;
    });

    for (const entry of sorted) {
      if (this.matchRule(entry.rule, message, session)) {
        return {
          agentId: entry.agentId,
          matchedBy: 'rule',
          confidence: 0.95,
        };
      }
    }

    return null;
  }

  /**
   * 匹配单条规则
   */
  private matchRule(rule: RouteRule, message: string, session?: SessionContext): boolean {
    const { intent, pattern, condition } = rule.match;

    // 条件匹配
    if (condition && session) {
      if (!condition(message, session)) {
        return false;
      }
    }

    // 意图匹配（精确匹配，需要从历史意图中查找）
    // 暂时不实现，因为意图需要先分析

    // 正则匹配
    if (pattern) {
      if (pattern.test(message)) {
        return true;
      }
    }

    return false;
  }

  /**
   * LLM 语义路由（第二级）
   *
   * 使用 LLM 判断用户意图属于哪个 Agent
   */
  private async llmRoute(message: string): Promise<RouterResult | null> {
    const agents = this.agentRegistry.getAll();
    
    if (agents.length === 0) {
      return null;
    }

    // 如果只有一个 Agent，直接返回
    if (agents.length === 1) {
      return {
        agentId: agents[0].id,
        matchedBy: 'llm',
        confidence: 0.9,
      };
    }

    // 构建提示词
    const descriptions = agents
      .map((a) => `- ${a.id}: ${a.description}`)
      .join('\n');

    const prompt = `根据用户消息，判断应该由哪个 Agent 处理。

可选的 Agents:
${descriptions}

用户消息: ${message}

请只返回最合适的 Agent ID，不要返回其他内容。`;

    try {
      const response = await this.llmClient.call({
        messages: [{ role: 'user', content: prompt }],
      });

      const agentId = response.content.trim();

      // 验证返回的 agentId 是否有效
      if (this.agentRegistry.get(agentId)) {
        return {
          agentId,
          matchedBy: 'llm',
          confidence: 0.8,
        };
      }

      return null;
    } catch (error) {
      console.error('[Router] LLM routing failed:', error);
      return null;
    }
  }

  /**
   * 设置默认 Agent
   */
  setDefaultAgent(agentId: string): void {
    this.defaultAgentId = agentId;
  }

  /**
   * 启用/禁用 LLM 路由
   */
  setLlmRoutingEnabled(enabled: boolean): void {
    this.enableLlmRouting = enabled;
  }
}

/**
 * 创建 Router
 */
export function createRouter(config: RouterConfig): Router {
  return new Router(config);
}
