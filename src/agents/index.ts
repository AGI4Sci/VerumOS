import type { Agent } from './types.js';
import {
  dataAgent,
  dataAgentMeta,
  dataAgentProcessor,
  createDataAgentConfig,
} from './data-agent.js';
import { ModelAgentDef } from './model-agent.js';
import { AnalysisAgentDef } from './analysis-agent.js';
import { AgentRegistry as NewAgentRegistry } from '../registry/agent-registry.js';

/**
 * AgentDef 转 Agent 适配器
 *
 * 将声明式的 AgentDef 转换为 Agent 接口
 */
function agentDefToAgent(def: typeof ModelAgentDef | typeof AnalysisAgentDef): Agent {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    capabilities: {
      inputs: [],
      outputs: [],
      skills: def.skills || [],
    },
    processMessage: async (message: string) => {
      // 占位 Agent 的简单实现：返回提示信息
      return {
        content: `⚠️ **${def.name}** 功能正在开发中\n\n暂时无法处理此请求。请使用 Data Agent 进行数据相关操作，或等待后续版本更新。\n\n您的请求：${message}`,
        type: 'text' as const,
      };
    },
  };
}

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
    // 返回 data-agent 作为默认
    const dataAgentInstance = this.agents.get('data-agent');
    if (dataAgentInstance) {
      return dataAgentInstance;
    }
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

// 注册 Data Agent
agentRegistry.register(dataAgent as Agent);

// 注册 Model Agent 和 Analysis Agent（占位实现）
agentRegistry.register(agentDefToAgent(ModelAgentDef));
agentRegistry.register(agentDefToAgent(AnalysisAgentDef));

// 导出新的 registry 供高级使用
export { NewAgentRegistry };

// 导出 Agent 定义
export { ModelAgentDef } from './model-agent.js';
export { AnalysisAgentDef } from './analysis-agent.js';

// 导出 Data Agent 相关
export {
  dataAgent,
  dataAgentMeta,
  dataAgentProcessor,
  createDataAgentConfig,
};
export * from './types.js';
export * from './base.js';