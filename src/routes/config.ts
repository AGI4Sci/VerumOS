import { Hono } from 'hono';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, loadConfig } from '../config.js';
import { logger } from '../utils/logger.js';

const configRouter = new Hono();

// 配置文件路径
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '../../.env');

// LLM 配置接口
interface LLMConfig {
  apiProvider: 'openai' | 'anthropic';
  apiKey: string;
  baseUrl: string;
  model: string;
}

// 获取当前配置（不返回完整的 apiKey，只返回脱敏版本）
configRouter.get('/config', (c) => {
  const llmConfig: LLMConfig = {
    apiProvider: (process.env.LLM_API_PROVIDER as 'openai' | 'anthropic') || 'openai',
    apiKey: config.llm.apiKey ? `${config.llm.apiKey.slice(0, 8)}...${config.llm.apiKey.slice(-4)}` : '',
    baseUrl: config.llm.baseUrl || '',
    model: config.llm.model || 'glm-5',
  };

  return c.json({
    ok: true,
    config: {
      llm: llmConfig,
      python: {
        path: config.python.path || '',
      },
    },
  });
});

// 更新配置
configRouter.post('/config', async (c) => {
  try {
    const body = await c.req.json();
    const { llm, python } = body;

    // 构建新的环境变量
    const envUpdates: string[] = [];

    if (llm) {
      if (llm.apiProvider) {
        envUpdates.push(`LLM_API_PROVIDER=${llm.apiProvider}`);
        process.env.LLM_API_PROVIDER = llm.apiProvider;
      }
      if (llm.apiKey && !llm.apiKey.includes('...')) {
        envUpdates.push(`LLM_API_KEY=${llm.apiKey}`);
        process.env.LLM_API_KEY = llm.apiKey;
      }
      if (llm.baseUrl) {
        envUpdates.push(`LLM_BASE_URL=${llm.baseUrl}`);
        process.env.LLM_BASE_URL = llm.baseUrl;
      }
      if (llm.model) {
        envUpdates.push(`LLM_MODEL=${llm.model}`);
        process.env.LLM_MODEL = llm.model;
      }
    }

    if (python?.path) {
      envUpdates.push(`PYTHON_PATH=${python.path}`);
      process.env.PYTHON_PATH = python.path;
    }

    // 读取现有 .env 文件
    let envContent = '';
    try {
      envContent = await fs.readFile(ENV_PATH, 'utf-8');
    } catch {
      // 文件不存在，创建新的
    }

    // 更新环境变量
    const envLines = envContent.split('\n');
    const updatedKeys = new Set<string>();

    for (let i = 0; i < envLines.length; i++) {
      const line = envLines[i].trim();
      if (!line || line.startsWith('#')) continue;

      const [key] = line.split('=');
      const update = envUpdates.find(u => u.startsWith(`${key}=`));
      if (update) {
        envLines[i] = update;
        updatedKeys.add(key);
      }
    }

    // 添加新的环境变量
    for (const update of envUpdates) {
      const [key] = update.split('=');
      if (!updatedKeys.has(key)) {
        envLines.push(update);
      }
    }

    // 保存到 .env 文件
    const newEnvContent = envLines.filter(l => l.trim()).join('\n') + '\n';
    await fs.writeFile(ENV_PATH, newEnvContent, 'utf-8');

    logger.info('[config] Configuration saved to .env file');

    // 重新加载配置
    Object.assign(config, loadConfig());

    return c.json({
      ok: true,
      message: '配置已保存，重启服务后完全生效',
    });
  } catch (error) {
    logger.error('[config] Failed to save config:', error);
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : '保存配置失败',
    }, 500);
  }
});

// 测试 LLM 连接
configRouter.post('/config/test-llm', async (c) => {
  try {
    const { apiKey, baseUrl, model, apiProvider } = await c.req.json();

    // 动态选择客户端
    if (apiProvider === 'anthropic') {
      // Anthropic 暂不支持，返回提示
      return c.json({
        ok: false,
        error: 'Anthropic 协议暂未实现，请使用 OpenAI 兼容协议',
      });
    }

    // 使用 OpenAI 兼容协议测试
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({
      apiKey: apiKey || config.llm.apiKey,
      baseURL: baseUrl || config.llm.baseUrl,
    });

    const response = await client.chat.completions.create({
      model: model || config.llm.model,
      messages: [{ role: 'user', content: 'Hello, respond with "OK"' }],
      max_tokens: 10,
    });

    const content = response.choices[0]?.message?.content;

    return c.json({
      ok: true,
      message: 'LLM 连接成功',
      response: content,
    });
  } catch (error) {
    logger.error('[config] LLM test failed:', error);
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : 'LLM 连接测试失败',
    }, 500);
  }
});

export default configRouter;
