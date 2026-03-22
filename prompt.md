# VerumOS (明鉴) - TypeScript 后端实现任务

## 项目背景

VerumOS 是一个面向生物医学研究者的 AI 辅助决策系统，核心目标是把科研判断过程**可信化、可溯源、可修正**。

**当前状态：**
- ✅ 前端 Demo 已完成 (`web/biomedical_agent_demo.html`)
- ✅ 全架构图已完成 (`plan/bioagent_full_pluggable_architecture.html`)
- ✅ 实现计划已完成 (`plan/` 共 11 个子任务)
- 🔲 TypeScript 后端待实现

## 任务目标

按照 `plan/` 目录中的任务文件，实现 TypeScript 后端核心功能（Task 01-09）。核心功能：

1. **项目脚手架** (Task 01) - package.json, tsconfig.json, 入口文件
2. **Zod Schema 定义** (Task 02) - 所有数据结构
3. **Hono HTTP 服务器** (Task 03) - 路由骨架
4. **场景注册表** (Task 04) - 3 个内置研究场景
5. **Asset Store** (Task 05) - 资产存储（内存 + JSON 持久化）
6. **Data Agent** (Task 06) - Tool Use 检索 PubMed / Semantic Scholar
7. **Model Agent** (Task 07) - Tool Use 检索 UniProt / STRING / ClinicalTrials
8. **分析流水线** (Task 08) - Agentic Loop + Decision Synthesis
9. **专家修正写回** (Task 09) - Human-in-Loop

## 技术栈

| 层次 | 选型 | 说明 |
|------|------|------|
| 语言 | TypeScript ESM (Node 22+) | - |
| HTTP | Hono 4.12.8 | 与 openclaw 版本对齐 |
| 校验 | Zod | - |
| LLM | OpenAI 兼容 API | **使用中转站** |
| 测试 | Vitest | - |

### LLM API 配置（重要）

本项目使用中转站 API，而非官方 Anthropic API：

```
api_key: sk-GZlfkTrS1BStAtfSLBM94NL6L2MiBrQOCz39c4jXQ4H5jMzG
base_url: http://35.220.164.252:3888/v1
model: glm-5
```

**实现要求：**
- 使用 `openai` npm 包，设置 `baseURL` 为中转站地址
- **不要使用** `@anthropic-ai/sdk`
- glm-5 支持 function calling / tool use，已验证可用
- Tool Use 格式使用 OpenAI 标准格式（`tools` 参数 + `tool_calls` 响应）

### 环境变量 (.env)

```env
# LLM API
OPENAI_API_KEY=sk-GZlfkTrS1BStAtfSLBM94NL6L2MiBrQOCz39c4jXQ4H5jMzG
OPENAI_BASE_URL=http://35.220.164.252:3888/v1
LLM_MODEL=glm-5

# 服务配置
PORT=3000
DATA_DIR=./data
```

## 实现要求

### 1. 严格按照 plan/ 中的任务顺序实现

每个任务文件都有详细的实现指南，包括：
- 目标说明
- 代码示例
- 验收标准

### 2. 核心架构要点

```
src/
├── server.ts               # Hono 服务器 + 路由挂载
├── schemas.ts              # Zod schema 定义
├── scenarios.ts            # 场景注册表（静态元数据）
├── asset-store.ts          # 资产存储（内存 + 文件持久化）
├── scenario-cache.ts       # 分析结果内存缓存
├── pipeline.ts             # 分析流水线（LLM 编排）
├── agents/
│   ├── data-agent.ts       # Data Agent
│   ├── model-agent.ts      # Model Agent
│   └── decision-synthesis.ts
├── tools/
│   ├── registry.ts         # Tool 定义（OpenAI 格式）
│   ├── executor.ts         # 工具执行
│   └── agentic-loop.ts     # Agentic Loop
├── routes/
│   ├── bootstrap.ts
│   ├── run-analysis.ts
│   └── expert-correction.ts
└── utils/
    └── detect-scenario.ts
```

### 3. API 端点

```
GET  /api/bootstrap         → 返回场景列表、schema 摘要、资产指标
POST /api/run-analysis      → 触发分析流水线（20-40s，含真实 DB 检索）
POST /api/expert-correction → 写入专家修正，更新场景状态
GET  /                      → 服务静态 Demo HTML
GET  /health                → 健康检查
```

### 4. 真实数据库检索（Task 08 核心）

使用 LLM Tool Use 模式实现真正的 Research Agent：
- LLM 自主决定调用哪些数据库工具
- 工具执行真实 API 请求（PubMed、Semantic Scholar、UniProt、STRING、ClinicalTrials）
- LLM 综合检索结果生成可信的决策输出

**外部 API 已验证可用：**
- PubMed (NCBI E-utilities) ✅
- Semantic Scholar ✅
- STRING DB ✅
- ClinicalTrials.gov ✅
- NCBI Gene ✅

### 5. 前端对接

后端完全按照前端 `web/biomedical_agent_demo.html` 预期的数据格式返回。

**关键：** 参考 `plan/task-02-schemas.md` 中的 Schema 定义，确保返回数据结构与前端一致。

## 验收标准

1. `pnpm dev` 启动无报错
2. `curl http://localhost:3000/health` 返回 `{"ok":true}`
3. `GET /api/bootstrap` 返回包含 3 个场景的列表
4. `POST /api/run-analysis` 返回包含真实 PMID 或论文标题的分析结果
5. `POST /api/expert-correction` 成功写入并更新场景状态
6. TypeScript 类型检查通过，无隐式 any
7. 所有 schema 覆盖前端 `biomedical_agent_demo.html` 中的字段

## 工作流程

1. 先阅读 `plan/README.md` 了解整体架构
2. 按 Task 01 → Task 09 顺序实现
3. 每完成一个任务，运行验收标准检查
4. 确保前端 Demo 可以正常调用后端 API

## 重要提示

- 不要修改 `web/biomedical_agent_demo.html`（前端已完成）
- Hono 版本必须与 openclaw 对齐 (4.12.8)
- 使用 `tsx` 做开发热重载，`tsdown` 做生产构建
- 环境变量放在 `.env` 文件中

---

**工作结束后必需修改相关文件和 README.md, 使得项目状态与描述一致, 最后 push 到 git**