# Task 03 · HTTP 服务器与路由

## 目标

用 Hono 搭建 HTTP 服务器，挂载三条 API 路由和静态 HTML 服务，处理输入校验与错误。

---

## 路由清单

| 方法 | 路径 | 处理器 | 说明 |
|------|------|--------|------|
| GET  | `/` | 返回 demo HTML | 静态文件服务 |
| GET  | `/api/bootstrap` | `handleBootstrap` | 返回初始状态 |
| POST | `/api/run-analysis` | `handleRunAnalysis` | 触发分析 |
| POST | `/api/expert-correction` | `handleExpertCorrection` | 写入专家修正 |
| GET  | `/health` | `{ ok: true }` | 健康检查 |

---

## 可实现路径

### 文件：`src/server.ts`

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { zValidator } from "@hono/zod-validator";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { RunAnalysisRequestSchema, ExpertCorrectionRequestSchema } from "./schemas.js";
import { handleBootstrap }       from "./routes/bootstrap.js";
import { handleRunAnalysis }     from "./routes/run-analysis.js";
import { handleExpertCorrection } from "./routes/expert-correction.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const HTML  = readFileSync(resolve(__dir, "../demo/biomedical_agent_demo.html"), "utf-8");

const app = new Hono();

app.use("*", cors());   // 开发阶段允许跨域

app.get("/",       (c) => c.html(HTML));
app.get("/health", (c) => c.json({ ok: true }));

app.get ("/api/bootstrap",         handleBootstrap);
app.post("/api/run-analysis",      zValidator("json", RunAnalysisRequestSchema),      handleRunAnalysis);
app.post("/api/expert-correction", zValidator("json", ExpertCorrectionRequestSchema), handleExpertCorrection);

// 统一错误处理
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

serve(
  { fetch: app.fetch, port: Number(process.env.PORT ?? 3000) },
  (info) => console.log(`BioAgent → http://localhost:${info.port}`)
);
```

### 路由处理器拆分

将三个路由处理器放在 `src/routes/` 目录，保持 `server.ts` 简洁：

```
src/
├── server.ts
└── routes/
    ├── bootstrap.ts
    ├── run-analysis.ts
    └── expert-correction.ts
```

每个文件导出一个 Hono `Handler` 类型函数。

### 输入校验策略

使用 `@hono/zod-validator` 中间件，在路由层自动校验 JSON body。
校验失败时 Hono 会自动返回 400，无需在处理器内手动处理。

### 静态 HTML 服务

直接读取文件内容并用 `c.html()` 返回，避免引入额外的静态文件中间件依赖。
开发阶段 demo HTML 修改后需重启服务（`tsx watch` 会自动重启）。

---

## 依赖补充

`package.json` 需增加：

```json
"@hono/node-server": "^1.14.0",
"@hono/zod-validator": "^0.4.3"
```

---

## 验收标准

- `GET /` 返回 200 + HTML 内容
- `POST /api/run-analysis` 传入错误 body 时返回 400
- `GET /api/bootstrap` 返回 200 + JSON（暂可为空对象，后续 Task 04/05 填充）
- TypeScript 类型检查通过，无隐式 any
