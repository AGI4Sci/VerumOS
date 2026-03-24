/**
 * SCP Tool Invoker - SCP Hub 工具调用器
 *
 * 使用 MCP 协议调用 SCP Hub 的工具 API
 * 参考文档: https://github.com/InternScience/scp
 */

import type { ToolDef } from '../core/types.js';
import { config } from '../config.js';

/**
 * SCP 服务配置
 * 从 SCP 广场获取: https://scphub.intern-ai.org.cn/
 */
export const SCP_SERVERS: Record<string, { id: number; name: string; description: string }> = {
  // 药物研发
  'DrugSDA-Tool': { id: 1, name: 'DrugSDA-Tool', description: '药物分子筛选、设计与分析工具集' },
  'DrugSDA-Model': { id: 2, name: 'DrugSDA-Model', description: '分子对接、ADMET 预测、亲和力预测' },
  
  // 蛋白质工程
  'VenusFactory': { id: 3, name: 'VenusFactory', description: '蛋白质工程 AI 全流程工具' },
  'BioInfo-Tools': { id: 4, name: 'BioInfo-Tools', description: '蛋白质序列分析工具' },
  'Origene-UniProt': { id: 5, name: 'Origene-UniProt', description: 'UniProt 蛋白质数据库检索' },
  'Origene-STRING': { id: 6, name: 'Origene-STRING', description: '蛋白质相互作用网络' },
  
  // 基因组学
  'Origene-Ensembl': { id: 7, name: 'Origene-Ensembl', description: '基因组注释' },
  'Origene-UCSC': { id: 8, name: 'Origene-UCSC', description: '基因组可视化' },
  'Origene-NCBI': { id: 9, name: 'Origene-NCBI', description: 'NCBI 数据库检索' },
  'Origene-TCGA': { id: 10, name: 'Origene-TCGA', description: 'TCGA 癌症基因组数据' },
  
  // 疾病与靶点
  'Origene-OpenTargets': { id: 15, name: 'Origene-OpenTargets', description: '靶点发现与验证' },
  'Origene-Monarch': { id: 16, name: 'Origene-Monarch', description: '疾病-基因关联' },
  
  // 化学与分子
  'Origene-ChEMBL': { id: 17, name: 'Origene-ChEMBL', description: '生物活性数据库' },
  'Origene-PubChem': { id: 18, name: 'Origene-PubChem', description: '化学信息数据库' },
  'Origene-KEGG': { id: 19, name: 'Origene-KEGG', description: '代谢通路数据库' },
  
  // 综合工具
  'SciGraph': { id: 20, name: 'SciGraph', description: '跨学科知识图谱' },
  'Thoth': { id: 21, name: 'Thoth', description: '湿实验智能编排系统' },
};

/**
 * MCP 客户端 - 用于调用 SCP Hub 的 MCP 端点
 */
class MCPClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  /**
   * 获取 MCP 服务端点 URL
   */
  private getMCPUrl(serverId: number, serverName: string): string {
    return `${this.baseUrl}/api/v1/mcp/${serverId}/${serverName}`;
  }

  /**
   * 初始化 MCP 会话
   */
  async initialize(serverId: number, serverName: string): Promise<{ sessionId?: string; tools: any[] }> {
    const url = this.getMCPUrl(serverId, serverName);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'SCP-HUB-API-KEY': this.apiKey,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'VerumOS',
              version: '0.1.0',
            },
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MCP initialize failed (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      return {
        sessionId: result.result?.sessionId,
        tools: result.result?.capabilities?.tools || [],
      };
    } catch (error) {
      throw new Error(`Failed to initialize MCP session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 列出可用工具
   */
  async listTools(serverId: number, serverName: string): Promise<any[]> {
    const url = this.getMCPUrl(serverId, serverName);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'SCP-HUB-API-KEY': this.apiKey,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MCP tools/list failed (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      return result.result?.tools || [];
    } catch (error) {
      throw new Error(`Failed to list tools: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 调用工具
   */
  async callTool(serverId: number, serverName: string, toolName: string, args: Record<string, any>): Promise<any> {
    const url = this.getMCPUrl(serverId, serverName);
    
    console.log(`[MCP Client] Calling ${serverName}.${toolName}`);
    console.log(`[MCP Client] URL: ${url}`);
    console.log(`[MCP Client] Args:`, JSON.stringify(args, null, 2));
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'SCP-HUB-API-KEY': this.apiKey,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MCP tools/call failed (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      
      if (result.error) {
        throw new Error(`MCP error: ${result.error.message || JSON.stringify(result.error)}`);
      }

      // 解析结果
      const content = result.result?.content;
      if (Array.isArray(content) && content.length > 0) {
        const textContent = content.find((c: any) => c.type === 'text');
        if (textContent?.text) {
          try {
            return JSON.parse(textContent.text);
          } catch {
            return textContent.text;
          }
        }
      }
      
      return result.result;
    } catch (error) {
      console.error(`[MCP Client] Error:`, error);
      throw new Error(`Failed to call tool: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * 创建 MCP 客户端
 */
function createMCPClient(): MCPClient | null {
  const { apiKey, baseUrl } = config.scp;
  if (!apiKey) {
    console.warn('[SCP Tools] SCP_API_KEY not configured');
    return null;
  }
  return new MCPClient(baseUrl, apiKey);
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
        server_name: {
          type: 'string',
          description: 'SCP 服务名称，如 DrugSDA-Tool, VenusFactory, Origene-OpenTargets 等',
          enum: Object.keys(SCP_SERVERS),
        },
        tool_name: {
          type: 'string',
          description: '工具名称，如 get_associated_targets_by_disease_efoId',
        },
        arguments: {
          type: 'object',
          description: '工具参数，根据具体工具而定',
        },
      },
      required: ['server_name', 'tool_name'],
    },
    execute: async (params) => {
      const { server_name, tool_name, arguments: toolArgs } = params as {
        server_name: string;
        tool_name: string;
        arguments?: Record<string, any>;
      };

      const client = createMCPClient();
      if (!client) {
        return {
          success: false,
          error: 'SCP_API_KEY not configured',
        };
      }

      const server = SCP_SERVERS[server_name];
      if (!server) {
        return {
          success: false,
          error: `Unknown server: ${server_name}. Available: ${Object.keys(SCP_SERVERS).join(', ')}`,
        };
      }

      try {
        const result = await client.callTool(
          server.id,
          server.name,
          tool_name,
          toolArgs || {}
        );

        console.log(`[SCP Tool] Success:`, result);
        return {
          success: true,
          result,
        };
      } catch (error) {
        console.error(`[SCP Tool] Error:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
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
        server_name: {
          type: 'string',
          description: 'SCP 服务名称，不指定则列出所有服务',
          enum: Object.keys(SCP_SERVERS),
        },
      },
    },
    execute: async (params) => {
      const { server_name } = params as { server_name?: string };

      const client = createMCPClient();
      if (!client) {
        return {
          success: false,
          error: 'SCP_API_KEY not configured',
        };
      }

      if (server_name) {
        const server = SCP_SERVERS[server_name];
        if (!server) {
          return {
            success: false,
            error: `Unknown server: ${server_name}`,
          };
        }

        try {
          const tools = await client.listTools(server.id, server.name);
          return {
            success: true,
            server: server_name,
            tools: tools.map((t: any) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
            total: tools.length,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      // 列出所有服务
      return {
        success: true,
        servers: Object.entries(SCP_SERVERS).map(([name, info]) => ({
          id: info.id,
          name,
          description: info.description,
        })),
        total: Object.keys(SCP_SERVERS).length,
      };
    },
  };
}

/**
 * 创建 SCP 连接测试工具
 */
export function createSCPTestTool(): ToolDef {
  return {
    name: 'test_scp_connection',
    description: '测试 SCP Hub API 连接是否正常',
    parameters: {
      type: 'object',
      properties: {
        server_name: {
          type: 'string',
          description: '要测试的服务名称，默认测试 Origene-OpenTargets',
        },
      },
    },
    execute: async (params) => {
      const { server_name = 'Origene-OpenTargets' } = params as { server_name?: string };

      const client = createMCPClient();
      if (!client) {
        return {
          success: false,
          error: 'SCP_API_KEY not configured',
        };
      }

      const server = SCP_SERVERS[server_name];
      if (!server) {
        return {
          success: false,
          error: `Unknown server: ${server_name}`,
        };
      }

      try {
        console.log(`[SCP Test] Testing connection to ${server_name}...`);
        
        // 测试初始化
        const initResult = await client.initialize(server.id, server.name);
        console.log(`[SCP Test] Initialize result:`, initResult);
        
        // 获取工具列表
        const tools = await client.listTools(server.id, server.name);
        console.log(`[SCP Test] Found ${tools.length} tools`);

        // 测试一个简单调用
        let testResult = null;
        if (server_name === 'Origene-OpenTargets') {
          testResult = await client.callTool(
            server.id,
            server.name,
            'get_associated_targets_by_disease_efoId',
            { efoId: 'EFO_0000311' } // lung cancer
          );
          console.log(`[SCP Test] Test call result:`, testResult);
        }

        return {
          success: true,
          server: server_name,
          serverId: server.id,
          toolCount: tools.length,
          sampleTools: tools.slice(0, 5).map((t: any) => t.name),
          testCall: testResult ? 'passed' : 'skipped',
        };
      } catch (error) {
        console.error(`[SCP Test] Error:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * 批量注册 SCP 工具
 */
export function registerSCPTools(registry: { register: (tool: ToolDef) => void }): void {
  registry.register(createSCPToolInvoker());
  registry.register(createSCPToolListTool());
  registry.register(createSCPTestTool());
  console.log('[SCP Tools] Registered 3 SCP tools (MCP protocol)');
}
