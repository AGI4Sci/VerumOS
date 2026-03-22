import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  llm: z.object({
    apiKey: z.string().default(''),
    baseUrl: z.string().default('http://35.220.164.252:3888/v1/'),
    model: z.string().default('glm-5'),
  }),
  server: z.object({
    port: z.number().int().positive().default(3000),
  }),
  data: z.object({
    dir: z.string().default('./data'),
  }),
  python: z.object({
    path: z.string().default('/opt/homebrew/Caskroom/miniconda/base/bin/python'),
  }),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(): AppConfig {
  return schema.parse({
    llm: {
      apiKey: process.env.LLM_API_KEY || '',
      baseUrl: process.env.LLM_BASE_URL || 'http://35.220.164.252:3888/v1/',
      model: process.env.LLM_MODEL || 'glm-5',
    },
    server: {
      port: Number.parseInt(process.env.PORT || '3000', 10),
    },
    data: {
      dir: process.env.DATA_DIR || './data',
    },
    python: {
      path: process.env.PYTHON_PATH || '/opt/homebrew/Caskroom/miniconda/base/bin/python',
    },
  });
}

export const config = loadConfig();
