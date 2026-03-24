// 测试 SCP MCP 连接
const SCP_API_KEY = 'sk-b0eca789-0a05-4545-ac44-894e018d7503';
const SCP_URL = 'https://scp.intern-ai.org.cn/api/v1/mcp/15/Origene-OpenTargets';

async function test() {
  console.log('Testing MCP connection...');
  console.log('URL:', SCP_URL);
  
  // 测试 initialize
  console.log('\n1. Testing initialize...');
  try {
    const response = await fetch(SCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'SCP-HUB-API-KEY': SCP_API_KEY,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      }),
    });
    
    console.log('Status:', response.status, response.statusText);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log('Response:', text.slice(0, 500));
  } catch (error) {
    console.error('Error:', error);
  }
  
  // 测试 tools/list
  console.log('\n2. Testing tools/list...');
  try {
    const response = await fetch(SCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'SCP-HUB-API-KEY': SCP_API_KEY,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });
    
    console.log('Status:', response.status, response.statusText);
    const data = await response.json();
    console.log('Tools count:', data.result?.tools?.length || 0);
    console.log('First tool:', data.result?.tools?.[0]?.name);
  } catch (error) {
    console.error('Error:', error);
  }
}

test();
