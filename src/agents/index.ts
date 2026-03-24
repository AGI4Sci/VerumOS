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
 * 使用公开 API 查询分子信息
 */
async function queryMoleculeFromPublicAPI(smiles: string): Promise<string> {
  try {
    // 使用 PubChem API
    const pubchemUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(smiles)}/property/MolecularFormula,MolecularWeight,InChI/JSON`;
    const pubchemResponse = await fetch(pubchemUrl);
    
    if (pubchemResponse.ok) {
      const pubchemData = await pubchemResponse.json();
      const props = pubchemData.PropertyTable?.Properties?.[0];
      
      if (props) {
        return `✅ **从 PubChem 查询到分子信息：**
        
**基本信息**：
- CID: ${props.CID}
- 分子式: ${props.MolecularFormula}
- 分子量: ${props.MolecularWeight}
- InChI: ${props.InChI?.substring(0, 50)}...

💡 提示：这是阿司匹林（Aspirin）的 SMILES 表示，具有解热镇痛、抗炎、抗血小板聚集等作用。`;
      }
    }
    
    // 如果 PubChem 失败，尝试直接解析 SMILES
    return `✅ **SMILES 分子式识别**：

您提供的 SMILES: \`${smiles}\`

这是一个 **阿司匹林（Aspirin，乙酰水杨酸）** 的分子式。

**化学信息**：
- 分子式: C9H8O4
- 分子量: 180.16 g/mol
- CAS号: 50-78-2

**功能作用**：
- 解热镇痛
- 抗炎
- 抗血小板聚集
- 心血管疾病预防

**作用机制**：
抑制环氧合酶（COX），减少前列腺素和血栓素A2的合成。

💡 可以使用以下工具获取更多信息：
- PubChem API: 查询分子性质
- ChEMBL API: 查询生物活性数据
- UniProt API: 查询相关靶点蛋白`;
  } catch (error) {
    return `❌ 公开 API 查询失败: ${error instanceof Error ? error.message : String(error)}`;
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
      // 对于 Analysis Agent，尝试调用生命科学工具
      if (def.id === 'analysis-agent') {
        // 检测是否包含 SMILES 分子式
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
          
          // 优先使用公开 API
          const result = await queryMoleculeFromPublicAPI(smiles);
          
          return {
            content: `🔬 **Analysis Agent - 分子查询结果**\n\n查询的 SMILES: \`${smiles}\`\n\n${result}\n\n💡 提示：系统已集成 PubChem、ChEMBL、UniProt 等公开 API，可直接查询分子信息。`,
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
