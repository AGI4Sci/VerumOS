/**
 * SCP Tool Invoker - SCP Hub 工具调用器
 *
 * 负责调用 SCP Hub 的工具 API
 */

import type { ToolDef } from '../core/types.js';
import { config } from '../config.js';

/**
 * SCP 工具调用请求
 */
interface SCPToolRequest {
  tool_id: string;
  action: string;
  parameters: Record<string, unknown>;
}

/**
 * SCP 工具调用响应
 */
interface SCPToolResponse {
  success: boolean;
  result?: unknown;
  error?: string;
  metadata?: {
    execution_time?: number;
    tool_version?: string;
  };
}

/**
 * 调用 SCP Hub API
 */
async function callSCPAPI(request: SCPToolRequest): Promise<SCPToolResponse> {
  const { apiKey, baseUrl } = config.scp;

  if (!apiKey) {
    return {
      success: false,
      error: 'SCP_API_KEY not configured',
    };
  }

  try {
    const response = await fetch(`${baseUrl}/api/v1/tools/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `SCP API error (${response.status}): ${errorText}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      result: data.result || data,
      metadata: data.metadata,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to call SCP API: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 创建 SCP 工具调用器
 */
export function createSCPToolInvoker(): ToolDef {
  return {
    name: 'invoke_scp_tool',
    description: '调用 SCP Hub 科研工具。支持药物研发、蛋白质工程、基因组学等领域的 2302 个工具。',
    parameters: {
      type: 'object',
      properties: {
        tool_id: {
          type: 'string',
          description: 'SCP 工具 ID，如 DrugSDA-Tool, VenusFactory 等',
        },
        action: {
          type: 'string',
          description: '工具操作类型，如 format_convert, similarity_calc, docking 等',
        },
        parameters: {
          type: 'object',
          description: '工具参数，根据具体工具而定',
        },
      },
      required: ['tool_id', 'action', 'parameters'],
    },
    execute: async (params) => {
      const { tool_id, action, parameters } = params as SCPToolRequest;

      console.log(`[SCP Tool] Invoking ${tool_id}.${action}`);
      console.log(`[SCP Tool] Parameters:`, parameters);

      const result = await callSCPAPI({ tool_id, action, parameters: parameters as Record<string, unknown> });

      if (result.success) {
        console.log(`[SCP Tool] Success:`, result.result);
      } else {
        console.error(`[SCP Tool] Error:`, result.error);
      }

      return result;
    },
  };
}

/**
 * 创建 SCP 工具列表查询工具
 */
export function createSCPToolListTool(): ToolDef {
  return {
    name: 'list_scp_tools',
    description: '列出 SCP Hub 可用的科研工具',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: '工具分类，如 drug_discovery, protein_engineering, genomics 等',
        },
        search: {
          type: 'string',
          description: '搜索关键词',
        },
      },
    },
    execute: async (params) => {
      const { category, search } = params as { category?: string; search?: string };

      // SCP 工具列表（从 tool.md 提取）
      const tools = [
        {
          id: 'DrugSDA-Tool',
          name: 'DrugSDA-Tool',
          category: 'drug_discovery',
          provider: '北京大学',
          toolCount: 28600,
          type: '数据库/计算工具',
          description: '药物分子筛选、设计与分析工具集',
        },
        {
          id: 'DrugSDA-Model',
          name: 'DrugSDA-Model',
          category: 'drug_discovery',
          provider: '北京大学',
          toolCount: 1700,
          type: '模型服务',
          description: '分子对接、结合口袋识别、亲和力预测、ADMET评估',
        },
        {
          id: 'VenusFactory',
          name: 'VenusFactory',
          category: 'protein_engineering',
          provider: '上海交通大学',
          toolCount: 1500,
          type: '数据库/计算工具/模型服务',
          description: '蛋白质工程 AI 全流程工具',
        },
        {
          id: 'BioInfo-Tools',
          name: 'BioInfo-Tools',
          category: 'protein_engineering',
          provider: '上海人工智能实验室',
          toolCount: 55,
          type: '数据库/计算工具/模型服务',
          description: '蛋白质序列分析工具',
        },
        {
          id: 'Origene-UniProt',
          name: 'Origene-UniProt',
          category: 'protein_engineering',
          provider: '临港实验室',
          toolCount: 121,
          type: '数据库',
          description: 'UniProt 蛋白质数据库检索',
        },
        {
          id: 'Origene-TCGA',
          name: 'Origene-TCGA',
          category: 'genomics',
          provider: '临港实验室',
          toolCount: 8,
          type: '数据库',
          description: 'TCGA 癌症基因组数据库检索',
        },
        {
          id: 'Origene-KEGG',
          name: 'Origene-KEGG',
          category: 'pathway',
          provider: '临港实验室',
          toolCount: 10,
          type: '数据库',
          description: 'KEGG 通路数据库检索',
        },
        {
          id: 'SciGraph',
          name: 'SciGraph',
          category: 'knowledge_graph',
          provider: '上海人工智能实验室',
          toolCount: 4800,
          type: '数据库',
          description: '科学研究统一知识查询服务',
        },
        {
          id: 'Thoth',
          name: 'Thoth',
          category: 'wetlab',
          provider: '上海人工智能实验室',
          toolCount: 1300,
          type: '湿实验操作/模型服务',
          description: '湿实验智能编排系统',
        },
      ];

      let filtered = tools;

      if (category) {
        filtered = filtered.filter(t => t.category === category);
      }

      if (search) {
        const searchLower = search.toLowerCase();
        filtered = filtered.filter(t =>
          t.name.toLowerCase().includes(searchLower) ||
          t.description.toLowerCase().includes(searchLower)
        );
      }

      return {
        success: true,
        tools: filtered,
        total: filtered.length,
      };
    },
  };
}

/**
 * 批量注册 SCP 工具
 */
export function registerSCPTools(registry: { register: (tool: ToolDef) => void }): void {
  registry.register(createSCPToolInvoker());
  registry.register(createSCPToolListTool());
  console.log('[SCP Tools] Registered 2 SCP tools');
}
