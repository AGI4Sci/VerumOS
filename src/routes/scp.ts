/**
 * SCP Tools API Routes - SCP 工具 API 路由
 * 
 * 使用 MCP 协议调用 SCP Hub 工具
 */

import { Hono } from 'hono';
import { config } from '../config.js';

const app = new Hono();

/**
 * SCP 服务配置
 */
const SCP_SERVERS: Record<string, { id: number; name: string; description: string }> = {
  'Origene-OpenTargets': { id: 15, name: 'Origene-OpenTargets', description: '靶点发现与验证' },
  'Origene-ChEMBL': { id: 4, name: 'Origene-ChEMBL', description: '生物活性数据库' },
  'Origene-UniProt': { id: 10, name: 'Origene-UniProt', description: 'UniProt 蛋白质数据库' },
  'Origene-TCGA': { id: 11, name: 'Origene-TCGA', description: 'TCGA 癌症基因组数据' },
  'Origene-KEGG': { id: 19, name: 'Origene-KEGG', description: '代谢通路数据库' },
};

/**
 * 获取 MCP URL
 */
function getMCPUrl(serverId: number, serverName: string): string {
  const baseUrl = config.scp.baseUrl || 'https://scp.intern-ai.org.cn';
  const url = `${baseUrl}/api/v1/mcp/${serverId}/${serverName}`;
  console.log('[SCP] MCP URL:', url);
  return url;
}

/**
 * 调用 MCP 工具
 */
async function callMCPTool(url: string, method: string, params: any = {}): Promise<any> {
  const apiKey = config.scp.apiKey;
  
  console.log('[SCP] Calling MCP:', method);
  console.log('[SCP] API Key:', apiKey ? `${apiKey.slice(0, 10)}...` : 'NOT SET');
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'SCP-HUB-API-KEY': apiKey,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });

  console.log('[SCP] Response status:', response.status);
  
  if (!response.ok) {
    const text = await response.text();
    console.error('[SCP] Error response:', text);
    throw new Error(`MCP ${method} failed (${response.status}): ${text}`);
  }

  const result = await response.json();
  
  if (result.error) {
    throw new Error(`MCP error: ${result.error.message || JSON.stringify(result.error)}`);
  }
  
  return result;
}

/**
 * 列出可用的 SCP 服务
 */
app.get('/', async (c) => {
  const servers = Object.entries(SCP_SERVERS).map(([name, info]) => ({
    id: info.id,
    name,
    description: info.description,
  }));

  return c.json({
    ok: true,
    servers,
    total: servers.length,
    scpConfigured: !!config.scp.apiKey,
  });
});

/**
 * 列出指定服务的工具
 */
app.get('/tools/:serverName', async (c) => {
  const serverName = c.req.param('serverName');
  const server = SCP_SERVERS[serverName];
  
  if (!server) {
    return c.json({
      ok: false,
      error: `Unknown server: ${serverName}`,
    }, 400);
  }

  if (!config.scp.apiKey) {
    return c.json({
      ok: false,
      error: 'SCP_API_KEY not configured',
    }, 500);
  }

  try {
    const url = getMCPUrl(server.id, server.name);
    const result = await callMCPTool(url, 'tools/list', {});
    const tools = result.result?.tools || [];
    
    return c.json({
      ok: true,
      server: serverName,
      tools: tools.map((t: any) => ({
        name: t.name,
        description: t.description,
      })),
      total: tools.length,
    });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 调用 SCP 工具
 */
app.post('/invoke', async (c) => {
  try {
    const body = await c.req.json();
    const { server_name, tool_name, arguments: toolArgs } = body;

    if (!server_name || !tool_name) {
      return c.json({
        ok: false,
        error: 'Missing required fields: server_name, tool_name',
      }, 400);
    }

    const server = SCP_SERVERS[server_name];
    if (!server) {
      return c.json({
        ok: false,
        error: `Unknown server: ${server_name}`,
      }, 400);
    }

    if (!config.scp.apiKey) {
      return c.json({
        ok: false,
        error: 'SCP_API_KEY not configured',
      }, 500);
    }

    console.log(`[SCP] Invoking ${server_name}.${tool_name}`);

    const url = getMCPUrl(server.id, server.name);
    const result = await callMCPTool(url, 'tools/call', {
      name: tool_name,
      arguments: toolArgs || {},
    });

    // 解析结果
    const content = result.result?.content;
    let data = result.result;
    
    if (Array.isArray(content) && content.length > 0) {
      const textContent = content.find((c: any) => c.type === 'text');
      if (textContent?.text) {
        try {
          data = JSON.parse(textContent.text);
        } catch {
          data = textContent.text;
        }
      }
    }

    return c.json({
      ok: true,
      result: data,
    });
  } catch (error) {
    console.error('[SCP] Error:', error);
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 调试信息
 */
app.get('/debug', async (c) => {
  return c.json({
    scpConfig: {
      apiKey: config.scp.apiKey ? `${config.scp.apiKey.slice(0, 10)}...${config.scp.apiKey.slice(-4)}` : 'NOT SET',
      baseUrl: config.scp.baseUrl,
      keyLength: config.scp.apiKey?.length || 0,
    },
    envCheck: {
      SCP_API_KEY: process.env.SCP_API_KEY ? 'SET' : 'NOT SET',
      SCP_BASE_URL: process.env.SCP_BASE_URL || 'NOT SET',
    },
  });
});

/**
 * 测试 SCP API 连接
 */
app.get('/test', async (c) => {
  console.log('[SCP Test] Starting test...');
  console.log('[SCP Test] Config:', {
    apiKey: config.scp.apiKey ? `${config.scp.apiKey.slice(0, 10)}...` : 'NOT SET',
    baseUrl: config.scp.baseUrl,
  });

  if (!config.scp.apiKey) {
    return c.json({
      ok: false,
      error: 'SCP_API_KEY not configured',
      configured: false,
    });
  }

  try {
    const server = SCP_SERVERS['Origene-OpenTargets'];
    const url = getMCPUrl(server.id, server.name);
    
    // 测试 initialize
    console.log('[SCP Test] Testing initialize...');
    await callMCPTool(url, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'VerumOS', version: '0.1.0' },
    });
    
    // 测试 tools/list
    console.log('[SCP Test] Testing tools/list...');
    const listResult = await callMCPTool(url, 'tools/list', {});
    const tools = listResult.result?.tools || [];
    console.log('[SCP Test] Found', tools.length, 'tools');

    // 测试工具调用
    console.log('[SCP Test] Testing tool call...');
    const callResult = await callMCPTool(url, 'tools/call', {
      name: 'get_associated_targets_by_disease_efoId',
      arguments: { efoId: 'EFO_0000311' },
    });
    
    const content = callResult.result?.content;
    let testData = null;
    if (Array.isArray(content) && content[0]?.text) {
      try {
        testData = JSON.parse(content[0].text);
      } catch {
        testData = content[0].text;
      }
    }

    return c.json({
      ok: true,
      configured: true,
      baseUrl: config.scp.baseUrl,
      testServer: 'Origene-OpenTargets',
      toolCount: tools.length,
      sampleTools: tools.slice(0, 5).map((t: any) => t.name),
      testCallResult: testData ? 'success' : 'null',
    });
  } catch (error) {
    console.error('[SCP Test] Error:', error);
    return c.json({
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default app;
