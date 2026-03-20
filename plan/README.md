# BioAgent 实现方案总览

## 背景

`demo/biomedical_agent_demo.html` 已完成前端设计，展示了一个"可信科研副驾驶"系统（Veritas BioAgent）。
前端通过三个 API 与后端通信，但后端尚未实现。

目标：以兼容 [openclaw](../openclaw) 架构的方式，实现一个生物医学 Research Agent 后端。

---

## 技术栈（与 openclaw 对齐）

| 层次 | 选型 | 对应 openclaw |
|------|------|---------------|
| 语言 | TypeScript ESM | 一致 |
| HTTP | Hono | 一致（openclaw 也用 Hono） |
| 校验 | Zod | 一致 |
| 运行时 | Node 22+ / Bun | 一致 |
| LLM | `@anthropic-ai/sdk` Claude claude-sonnet-4-6 | 一致（内置 anthropic 扩展） |
| 测试 | Vitest | 一致 |

openclaw 的扩展结构约定（`extensions/<id>/` 含 `src/api.ts` + `src/runtime-api.ts` + `openclaw.plugin.json`）可作为后续集成路径，本阶段先以独立服务实现，确保逻辑清晰、无冗余依赖。

---

## 前端依赖的 API 合约

```
GET  /api/bootstrap             → BootstrapResponse
POST /api/run-analysis          → RunAnalysisResponse
POST /api/expert-correction     → ExpertCorrectionResponse
GET  /                          → 静态 demo HTML
```

完整 schema 见 [task-02-schemas.md](./task-02-schemas.md)。

---

## 项目目录结构

```
BioAgent/
├── plan/                        # 本方案文档目录
│   ├── README.md               （本文件）
│   ├── task-01-project-scaffold.md
│   ├── task-02-schemas.md
│   ├── task-03-http-server.md
│   ├── task-04-scenario-registry.md
│   ├── task-05-asset-store.md
│   ├── task-06-data-agent.md
│   ├── task-07-model-agent.md
│   ├── task-08-analysis-pipeline.md
│   └── task-09-expert-correction.md
├── src/
│   ├── server.ts               # Hono 服务器 + 路由挂载
│   ├── schemas.ts              # Zod schema 定义
│   ├── scenarios.ts            # 场景注册表（静态元数据）
│   ├── asset-store.ts          # 资产存储（内存 + 文件持久化）
│   ├── pipeline.ts             # 分析流水线（LLM 编排）
│   └── agents/
│       ├── data-agent.ts       # Data Agent：数据质量 + Ontology
│       └── model-agent.ts      # Model Agent：分析推理
├── demo/
│   └── biomedical_agent_demo.html  （已有，不修改）
├── package.json
├── tsconfig.json
└── .env.example
```

---

## 子任务清单

| # | 任务文件 | 核心目标 | 依赖 |
|---|----------|----------|------|
| 01 | [task-01-project-scaffold.md](./task-01-project-scaffold.md) | 初始化 package.json / tsconfig / 入口 | 无 |
| 02 | [task-02-schemas.md](./task-02-schemas.md) | 定义全部 Zod schema | T01 |
| 03 | [task-03-http-server.md](./task-03-http-server.md) | Hono 服务器 + 三条路由骨架 | T01 T02 |
| 04 | [task-04-scenario-registry.md](./task-04-scenario-registry.md) | 内置 3 个研究场景静态数据 | T02 |
| 05 | [task-05-asset-store.md](./task-05-asset-store.md) | 资产存储（专家纠偏 / 知识节点 / 阴性结果） | T02 |
| 06 | [task-06-data-agent.md](./task-06-data-agent.md) | Data Agent：Tool Use 检索 PubMed / Semantic Scholar | T02 |
| 07 | [task-07-model-agent.md](./task-07-model-agent.md) | Model Agent：Tool Use 检索 UniProt / STRING / ClinicalTrials | T02 T06 |
| **08** | [task-08-analysis-pipeline.md](./task-08-analysis-pipeline.md) | **真实数据库检索 + Agentic Loop + 综合决策输出** | T04 T05 T06 T07 |
| 09 | [task-09-expert-correction.md](./task-09-expert-correction.md) | 专家修正写回 + 场景状态更新 | T05 T08 |
| **10** | [task-10-feishu-integration.md](./task-10-feishu-integration.md) | **飞书聊天群 @mention → 分析 → 卡片回复** | T08 |
| **11** | [task-11-discord-integration.md](./task-11-discord-integration.md) | **Discord `/bioagent` slash command 集成** | T08 |

---

## 数据库检索架构（Task 08 核心）

```
科学家提问
  │
  ├─ Data Agent (LLM + Tools)
  │    ├─ search_pubmed        → NCBI E-utilities（免费）
  │    └─ search_semantic_scholar → Semantic Scholar API（免费）
  │
  ├─ Model Agent (LLM + Tools)
  │    ├─ get_gene_info         → NCBI Gene（免费）
  │    ├─ get_protein_interactions → STRING DB（免费）
  │    └─ search_clinical_trials  → ClinicalTrials.gov v2（免费）
  │
  └─ Decision Synthesis (LLM，综合真实检索数据)
       → DecisionOutput（含真实 PMID / 论文标题）
```

---

## 聊天群集成架构（Task 10/11）

```
飞书 / Discord 群
  │  @BioAgent [研究问题]
  ▼
openclaw（已有渠道基础设施）
  │  接收 @mention，调用 bio_research 工具
  ▼
extensions/bio-research-agent/（openclaw skill）
  │  调用 BIOAGENT_URL/api/run-analysis
  ▼
BioAgent 服务器
  │  执行分析流水线（Task 08）
  ▼
格式化结果
  │  飞书 → Markdown 卡片
  │  Discord → Discord Embed / Components v2
  ▼
科学家看到分析报告（含文献来源、证据链、无效路径）
```

---

## 去冗余说明

openclaw 是一个完整的多渠道消息网关，包含设备配对、渠道路由、TUI、插件 SDK 等大量模块。
本方案的策略：

**复用 openclaw 的部分：**
- `@openclaw/feishu`、`@openclaw/discord` 渠道扩展（消息接收/发送/格式化）
- openclaw Plugin SDK（`definePluginEntry`、`api.registerTool`）
- 相同技术栈（TypeScript ESM + Hono + Zod）

**不引入的冗余部分：**
- 20+ 其他消息渠道模块
- 设备配对 / WebSocket 网关层
- Pi 嵌入式代理运行时
- TUI / CLI 交互框架
- iOS / Android / macOS 客户端
