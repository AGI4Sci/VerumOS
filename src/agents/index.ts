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
import { config } from '../config.js';

/**
 * 调用 SCP Hub API 查询分子信息
 */
async function queryMoleculeFromSCP(smiles: string): Promise<string> {
  const { apiKey, baseUrl } = config.scp;
  
  if (!apiKey) {
    return '❌ SCP API 未配置，无法查询分子信息。请在 .env 文件中设置 SCP_API_KEY。';
  }
  
  try {
    // 尝试调用 PubChem 工具
    const response = await fetch(`${baseUrl}/api/v1/tools/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        tool_id: 'Origene-PubChem',
        action: 'search_by_smiles',
        parameters: { smiles },
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return `❌ SCP API 调用失败 (${response.status}): ${errorText}`;
    }
    
    const data = await response.json();
    return `✅ 从 SCP Hub 查询到分子信息：\n${JSON.stringify(data.result || data, null, 2)}`;
  } catch (error) {
    return `❌ SCP API 调用异常: ${error instanceof Error ? error.message : String(error)}`;
  }
}

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
      // 对于 Analysis Agent，尝试调用 SCP 工具
      if (def.id === 'analysis-agent') {
        // 检测是否包含 SMILES 分子式（简单的启发式检测）
        const smilesMatch = message.match(/[A-Za-z0-9@+\[\]()#%=.]+/);
        
        if (smilesMatch && (
          message.includes('分子') ||
          message.includes('SMILES') ||
          message.includes('PubChem') ||
          message.includes('ChEMBL') ||
          message.includes('功能') ||
          message.includes('查询')
        )) {
          const smiles = smilesMatch[0];
          const scpResult = await queryMoleculeFromSCP(smiles);
          
          return {
            content: `🔬 **Analysis Agent - 分子查询结果**\n\n查询的 SMILES: \`${smiles}\`\n\n${scpResult}\n\n💡 提示：如果需要更详细的分析，请使用具体的工具名称（如 DrugSDA-Tool、Origene-PubChem 等）。`,
            type: 'text' as const,
          };
        }
      }
      
      // 默认的占位响应
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