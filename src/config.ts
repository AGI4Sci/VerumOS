import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  llm: z.object({
    apiKey: z.string(),
    baseUrl: z.string(),
    model: z.string().default('glm-5'),
  }),
  embedding: z.object({
    enabled: z.boolean().default(true),
    model: z.string().default('text-embedding-3-small'),
  }).optional(),
  server: z.object({
    port: z.number().int().positive().default(3000),
  }),
  data: z.object({
    dir: z.string().default('./data'),
  }),
  python: z.object({
    path: z.string(),
  }),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(): AppConfig {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL;
  const pythonPath = process.env.PYTHON_PATH;

  // 检查关键配置
  const warnings: string[] = [];

  if (!apiKey) {
    warnings.push('[config] LLM_API_KEY not set, LLM features will be disabled');
  }

  if (!baseUrl) {
    warnings.push('[config] LLM_BASE_URL not set, using default');
  }

  if (!pythonPath) {
    warnings.push('[config] PYTHON_PATH not set, Python skills may not work');
  }

  // 输出警告
  for (const warning of warnings) {
    console.warn(warning);
  }

  return schema.parse({
    llm: {
      apiKey: apiKey || '',
      baseUrl: baseUrl || '',
      model: process.env.LLM_MODEL || 'glm-5',
    },
    embedding: {
      enabled: process.env.EMBEDDING_ENABLED !== 'false',
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    },
    server: {
      port: Number.parseInt(process.env.PORT || '3000', 10),
    },
    data: {
      dir: process.env.DATA_DIR || './data',
    },
    python: {
      path: pythonPath || '',
    },
  });
}

export const config = loadConfig();