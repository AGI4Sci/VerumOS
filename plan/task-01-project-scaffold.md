# Task 01 · 项目脚手架

## 目标

初始化 BioAgent 后端的基础工程结构，确保 TypeScript ESM 环境可用、依赖对齐 openclaw 风格。

---

## 可实现路径

### 1. `package.json`

```jsonc
{
  "name": "bio-research-agent",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev":   "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "build": "tsdown src/server.ts --out-dir dist",
    "test":  "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.36.0",  // Claude API
    "hono":              "^4.12.8",   // HTTP（与 openclaw 版本对齐）
    "zod":               "^3.24.0"    // 校验
  },
  "devDependencies": {
    "tsx":              "^4.19.0",
    "tsdown":           "^0.12.0",
    "typescript":       "^5.7.0",
    "@types/node":      "^22.0.0",
    "vitest":           "^3.2.0",
    "dotenv":           "^17.3.0"
  }
}
```

**关键说明：**
- `hono` 版本与 openclaw 根 `package.json` 中 `"hono": "4.12.8"` 保持一致。
- 不引入 openclaw 本身作为依赖，避免拉入全部传递依赖。
- 使用 `tsx` 做开发热重载，`tsdown` 做生产构建（openclaw 也用 tsdown）。

### 2. `tsconfig.json`

```json
{
  "compilerOptions": {
    "target":       "ES2022",
    "module":       "ESNext",
    "moduleResolution": "bundler",
    "strict":       true,
    "noImplicitAny": true,
    "outDir":       "dist",
    "rootDir":      "src"
  },
  "include": ["src/**/*"]
}
```

### 3. `.env.example`

```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
DATA_DIR=./data
```

运行前复制为 `.env` 并填入真实 API Key。

### 4. `src/server.ts`（占位入口）

```ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) => {
  console.log(`BioAgent running on http://localhost:${info.port}`);
});
```

此时 `pnpm dev` 可以启动并响应 `/health`，后续各任务在此基础上挂载路由。

### 5. 数据目录

```
data/
  asset-store.json   # 运行时资产持久化（自动创建）
```

`data/` 加入 `.gitignore`，避免提交本地运行数据。

---

## 验收标准

- `pnpm dev` 启动无报错
- `curl http://localhost:3000/health` 返回 `{"ok":true}`
- TypeScript 类型检查通过
