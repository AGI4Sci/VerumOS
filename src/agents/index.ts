import type { Agent } from './types.js';
import { dataAgent } from './data-agent.js';

class AgentRegistry {
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
}

export const agentRegistry = new AgentRegistry();
agentRegistry.register(dataAgent);

export { dataAgent };
export * from './types.js';
export * from './base.js';
