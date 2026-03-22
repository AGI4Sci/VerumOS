import type { Agent } from './types.js';
import { dataAgent } from './data-agent.js';
import { AgentRegistry as NewAgentRegistry } from '../registry/agent-registry.js';

/**
 * 简单的 Agent 注册表（向后兼容）
 */
class SimpleAgentRegistry {
  private readonly agents = new Map<string, Agent>();

  register(agent: Agent): void {
    this.agents.set(agent.id, agent);
  }

  get(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  getDefault(): Agent {
    const agent = this.agents.values().next().value as Agent | undefined;
    if (!agent) {
      throw new Error('No agents registered');
    }
    return agent;
  }

  getAll(): Agent[] {
    return Array.from(this.agents.values());
  }
}

export const agentRegistry = new SimpleAgentRegistry();
agentRegistry.register(dataAgent);

// 导出新的 registry 供高级使用
export { NewAgentRegistry };

export { dataAgent };
export * from './types.js';
export * from './base.js';