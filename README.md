# VerumOS · 明鉴

**可信科研副驾驶** — 生命科学知识引擎

---

## 项目概述

VerumOS（明鉴）是一个面向生物医学研究者的 AI 辅助决策系统，核心目标是把科研判断过程**可信化、可溯源、可修正**：

- 基于真实文献数据库（PubMed、Semantic Scholar）和知识库（UniProt、STRING、ClinicalTrials.gov）做主动检索，而非凭 LLM 幻觉生成
- 每次分析沉积三类可信资产：**专家纠偏轨迹**、**有时间轴的知识节点**、**阴性结果/无效路径库**
- 科学家可通过前端面板提交修正意见（Human-in-Loop），写回知识库并实时更新判断

---

## 当前状态

| 模块 | 状态 |
|------|------|
| 前端 Demo | ✅ 已完成（`web/biomedical_agent_demo.html`） |
| 全架构图 | ✅ 已完成（`plan/bioagent_full_pluggable_architecture.html`） |
| 实现计划 | ✅ 已完成（`plan/` 共 11 个子任务） |
| TypeScript 后端 | 🔲 待实现（按 `plan/` 中任务顺序推进） |

---

## 项目结构

```text
VerumOS/
├── web/
│   └── biomedical_agent_demo.html   # 前端 Demo（直接用浏览器打开可预览）
├── plan/
│   ├── README.md                    # 实现方案总览（本文件的后端规划版）
│   ├── bioagent_full_pluggable_architecture.html  # 全架构可视化
│   ├── task-01-project-scaffold.md
│   ├── task-02-schemas.md
│   ├── task-03-http-server.md
│   ├── task-04-scenario-registry.md
│   ├── task-05-asset-store.md
│   ├── task-06-data-agent.md
│   ├── task-07-model-agent.md
│   ├── task-08-analysis-pipeline.md
│   ├── task-09-expert-correction.md
│   ├── task-10-feishu-integration.md
│   └── task-11-discord-integration.md
├── biomedical_ai_roadmap.html       # 产品路线图（可视化）
├── prompt.md                        # 工作指令
└── README.md                        # 本文件
```

> 后端代码目录（`src/`、`package.json`、`tsconfig.json`）在 Task 01 实现后创建。

---

## 前端 Demo

打开 `web/biomedical_agent_demo.html` 可直接预览完整 UI：

- **数据** / **模型** / **发现** / **验证** / **写作** 五个功能视图
- Data Agent 和 Model Agent 对象卡片
- 决策输出（当前建议 / 支持证据 / 反对证据 / 阴性路径 / 专家修正）
- Reasoning Trace 推理步骤可视化
- 知识节点 / 阴性结果 / 修正记录三个右侧 Panel Tab

当前为**静态原型**，尚未接入后端 API。

---

## 架构图

打开 `plan/bioagent_full_pluggable_architecture.html` 查看 8 层可插拔架构：

```
入口层       → VerumOS UI / 飞书 / Discord / +渠道扩展
HTTP 服务层  → Hono Server + Zod Schemas + Auth Module（可插拔）
编排层       → Pipeline Orchestrator + Scenario Registry + HITL（可插拔）+ Audit Logger（可插拔）
Agent 执行层 → Data Agent + Model Agent + Decision Synthesis + Validation Agent（可插拔）
核心算法层   → Hypothesis Engine / Evidence Scorer / Conflict Resolver / Negative Filter（均可插拔）
记忆/知识层  → Asset Store + Expert Correction + LTM（可插拔）+ Knowledge Decay（可插拔）
数据适配层   → Data Connector / Data Formatter / QC / Normalization（均可插拔）
外部数据库   → PubMed · Semantic Scholar · UniProt · STRING · ClinicalTrials.gov
```

点击任意模块可查看职责说明、接口定义和可替换实现选项。

---

## 技术栈

- **语言**：TypeScript ESM（Node 22+ / Bun）
- **HTTP**：Hono（与 openclaw 版本对齐）
- **校验**：Zod
- **LLM**：Anthropic SDK — `claude-sonnet-4-6`
- **工具调用**：Claude Tool Use（Agentic Loop，最多 8 轮）
- **测试**：Vitest

---

## 后端 API

```
GET  /api/bootstrap         → 返回场景列表、schema 摘要、资产指标
POST /api/run-analysis      → 触发分析流水线（20-40s，含真实 DB 检索）
POST /api/expert-correction → 写入专家修正，更新场景状态
GET  /                      → 服务静态 Demo HTML
GET  /health                → 健康检查
```

---

## 实现计划

详见 `plan/README.md`，按以下顺序推进：

| 任务 | 核心目标 |
|------|----------|
| T01 | 项目脚手架（package.json / tsconfig / 入口） |
| T02 | Zod Schema 定义（全部数据结构） |
| T03 | Hono 服务器 + 路由骨架 |
| T04 | 场景注册表（3 个内置研究场景） |
| T05 | Asset Store（内存 + JSON 持久化） |
| T06 | Data Agent（PubMed + Semantic Scholar Tool Use） |
| T07 | Model Agent（UniProt + STRING + ClinicalTrials Tool Use） |
| T08 | 分析流水线（Agentic Loop + Decision Synthesis） |
| T09 | 专家修正写回 |
| T10 | 飞书集成（openclaw skill） |
| T11 | Discord 集成（openclaw skill） |

---

## 与 openclaw 的关系

本项目作为独立 HTTP 服务运行，通过 openclaw Plugin SDK 注册为 `bio_research` 工具，复用 openclaw 已有的：

- 飞书 / Discord 渠道基础设施（消息接收、签名验证、回复格式化）
- TypeScript ESM + Hono + Zod 技术栈
- Plugin SDK（`definePluginEntry`、`api.registerTool`）

不引入 openclaw 的设备配对、Pi 代理运行时、TUI/CLI 框架等与科研 Agent 无关的模块。
