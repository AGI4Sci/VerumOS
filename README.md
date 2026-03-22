# VerumOS · 明鉴

科研 AI 操作系统的 Phase 1 最小可运行版本。

## 当前实现

### 核心功能
- **Data Agent**：数据探索、清洗、整合，支持需求文档驱动的工作流
- **csv-skill**：CSV/TSV/Excel 文件处理，支持读取、探索、转换、合并、转置
- **bioinfo-skill**：生物信息学分析，支持单细胞表达矩阵处理、QC、标准化、marker 基因分析
- **需求文档系统**：支持 Markdown 格式的需求文档，自动生成工具链
- **Job Workspace**：任务隔离、持久化、执行轨迹记录、任务恢复

### 架构亮点
- **Agent Runtime**：核心执行引擎（agentLoop），支持事件流、工具调用编排
- **声明式 Agent 配置**：Agent 只声明 systemPrompt、tools、convertToLlm，不继承执行引擎
- **Agent Registry**：支持多 Agent 注册和意图路由
- **Skill Registry**：支持多 Skill 注册和管理
- **意图规则声明式定义**：意图识别规则由各 Agent 声明，便于扩展和维护

### API 端点
- `POST /api/session` - 创建会话
- `GET /api/session/:id` - 获取会话状态
- `POST /api/chat` - 发送消息
- `POST /api/upload` - 上传文件
- `GET/POST /api/requirement/:sessionId` - 需求文档管理
- `GET /api/requirement/:sessionId/toolchain` - 获取工具链
- `GET /api/files` - 列出已上传文件
- `GET /api/jobs` - 列出所有任务
- `GET /api/jobs/:jobId` - 获取任务详情
- `POST /api/jobs/create` - 创建新任务（支持自定义名称）
- `PATCH /api/jobs/:jobId` - 更新任务名称/状态
- `GET /api/jobs/:jobId/files` - 获取任务文件列表
- `POST /api/session/resume` - 恢复任务
- `GET /health` - 健康检查
- `WS /ws` - WebSocket 会话同步

### 前端功能
- 三栏布局：左侧 Job Explorer + 中间聊天区 + 右侧需求文档/工具链/数据集面板
- Job Explorer：任务列表展示、创建新任务、切换任务、查看任务文件
- 数据预览表格：显示前 20 行，支持横向滚动，列类型标注
- 需求文档编辑器：Markdown 编辑 + 实时保存
- 工具链预览：自动生成推荐工具链

## 项目结构

```text
VerumOS/
├── data/                     # 运行时数据目录
│   └── job_YYYYMMDD_HHMM_xxx/  # 任务 workspace（直接在 data/ 下）
│       ├── job.json          # 任务元数据 + 轨迹 + 状态（一个文件搞定）
│       ├── inputs/           # 输入文件
│       └── outputs/          # 输出文件
├── skills/
│   ├── csv-skill/
│   │   └── SKILL.md         # CSV Skill 描述文件
│   └── bioinfo-skill/
│       └── SKILL.md         # Bioinfo Skill 描述文件
├── src/
│   ├── agents/              # Agent 实现（声明式配置）
│   │   ├── base.ts          # Agent 工具类（已废弃继承模式）
│   │   ├── data-agent.ts    # Data Agent 声明式配置
│   │   ├── requirement-doc.ts # 需求文档管理
│   │   └── types.ts         # 类型定义
│   ├── runtime/             # 核心 Runtime（纯执行引擎）
│   │   ├── agent-loop.ts    # 核心循环：async generator
│   │   ├── agent-runtime.ts # 执行引擎
│   │   ├── intent-classifier.ts # 意图分类器
│   │   ├── llm-client.ts    # LLM 调用抽象
│   │   └── conversation-state.ts # 对话状态机
│   ├── registry/            # 注册表
│   │   ├── agent-registry.ts # Agent 注册表
│   │   └── skill-registry.ts # Skill 注册表
│   ├── job/                 # 任务管理
│   │   ├── types.ts         # Job 类型定义
│   │   └── manager.ts       # Job 管理器
│   ├── execution/           # 本地 Python 执行器
│   ├── routes/              # API 路由
│   │   ├── chat.ts          # 聊天 API
│   │   ├── upload.ts        # 文件上传 API
│   │   ├── requirement.ts   # 需求文档 API
│   │   └── job.ts           # 任务 API
│   ├── skills/              # Skill 运行时
│   │   ├── csv-skill.ts     # CSV Skill 实现
│   │   ├── bioinfo-skill.ts # Bioinfo Skill 实现
│   │   └── index.ts         # Skill 注册表
│   ├── ws/                  # WebSocket 服务
│   ├── app.ts               # Hono app
│   ├── config.ts            # 环境配置
│   └── server.ts            # 服务入口
├── web/
│   └── index.html           # 前端 Demo
├── .env.example
├── package.json
└── tsconfig.json
```

## 环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

配置项：

| 变量 | 说明 | 必填 |
|------|------|------|
| `LLM_API_KEY` | 中转站 API Key | ✅ |
| `LLM_BASE_URL` | 中转站 API 地址 | ✅ |
| `PYTHON_PATH` | Python 解释器路径 | ✅ |
| `LLM_MODEL` | 模型名称（默认 `glm-5`） | ❌ |
| `PORT` | 服务端口（默认 `3000`） | ❌ |
| `DATA_DIR` | 运行时数据目录（默认 `./data`） | ❌ |

## 运行方式

```bash
pnpm install
pnpm dev
```

启动后：

- 健康检查：`GET http://localhost:3000/health`
- 前端页面：`GET http://localhost:3000/`
- WebSocket：`ws://localhost:3000/ws?sessionId=<sessionId>`

## 验收流程

### 1. 上传数据

前端点击"上传文件"，或直接请求：

```bash
curl -X POST http://localhost:3000/api/upload \
  -F sessionId=<session_id> \
  -F file=@data/count_matrix.csv
```

系统会：
1. 将文件保存到 `data/`
2. 调用 `Data Agent`
3. 由 `Data Agent` 调用 `csv-skill.read_file`
4. 返回 shape / columns / preview 概览

### 2. 需求讨论

用户输入："我想做细胞类型鉴定"

系统会：
1. 识别为 `requirement` 意图
2. 加载初始需求文档（如 `data/需求文档_单细胞分析.md`）
3. 与用户讨论需求细节
4. 自动生成工具链

### 3. 执行分析

用户确认方案后，系统会：
1. 更新需求文档状态为 `confirmed`
2. 根据工具链依次调用 Skill
3. 返回执行结果

## Data Agent 能力

当前支持：

- `upload`：上传或按路径读取 `csv/tsv/xlsx/xls`
- `explore`：返回 shape、columns、missing、quality、preview
- `question`：回答行数、列数、列名等基础问题
- `transform`：数据转换（`filter` / `normalize` / `log2`）
- `merge`：支持两份表格按公共列合并
- `requirement`：需求讨论，自动生成工具链
- `execute`：执行已确认的分析方案

## Skill 系统

### csv-skill

| 操作 | 说明 |
|------|------|
| `read_file` | 读取 CSV/TSV/Excel 文件，支持编码自动检测（UTF-8、GBK、GB2312、Latin1） |
| `explore_data` | 数据探索（统计、缺失值、质量） |
| `transform_data` | 数据转换（filter、normalize、log2） |
| `merge_data` | 按键合并多个数据集 |
| `transpose` | 矩阵转置 |

### bioinfo-skill

| 操作 | 说明 |
|------|------|
| `read_expression_matrix` | 读取单细胞表达矩阵，自动检测格式 |
| `quality_control` | QC 过滤（n_genes、pct_mito 阈值） |
| `normalize_counts` | 标准化（CPM、TPM、log1p、Scanpy） |
| `find_markers` | 寻找 marker 基因 |

## Job Workspace 架构

每个任务有独立的工作空间，直接在 `data/` 目录下：

```
data/job_20260322_2201_a1b2c3/
├── job.json          # 元数据 + 轨迹 + 状态（一个文件搞定）
├── inputs/           # 输入文件
│   ├── count_matrix.csv
│   └── cell_metadata.csv
└── outputs/          # 输出文件
    ├── normalized_matrix.csv
    └── qc_report.json
```

### job.json 结构

```json
{
  "id": "job_20260322_2201_a1b2c3",
  "sessionId": "sess_xxx",
  "status": "running",
  "summary": "单细胞数据分析 - 细胞类型鉴定",
  "createdAt": "2026-03-22T14:01:00Z",
  "updatedAt": "2026-03-22T14:30:00Z",
  "intent": { "type": "requirement", "confidence": 0.95 },
  "traces": [
    { "step": 1, "timestamp": "...", "type": "tool_call", "data": { "tool": "read_file" } },
    { "step": 2, "timestamp": "...", "type": "tool_result", "data": { "shape": {"rows": 1000} } }
  ],
  "state": {
    "activeDatasetId": "ds_001",
    "datasets": [{ "id": "ds_001", "name": "count_matrix.csv" }],
    "messages": [{ "role": "user", "content": "分析这份数据" }]
  }
}
```

**简化点**：
- 去掉 `jobs/` 前缀，job 目录直接在 `data/` 下
- 合并 `trace.jsonl` → `job.json` 里的 `traces` 数组
- 去掉 `checkpoints/`，中间状态记在 `job.json.state` 里
- 去掉 `uploads/`、`sessions/` 中间目录

### 任务恢复

```bash
# 列出所有任务
GET /api/jobs

# 恢复任务
POST /api/session/resume
{"jobId": "job_20260322_2201_a1b2c3"}
```

## Agent Runtime 架构

### agentLoop - 核心执行引擎

`agentLoop` 是一个 async generator，产出事件流：

```typescript
for await (const event of agentLoop(messages, context, config)) {
  console.log(event.type);
  // agent_start, turn_start, message_update, tool_execution_start, ...
}
```

### 声明式 Agent 配置

Agent 不继承 runtime，只声明能力：

```typescript
const dataAgentConfig = {
  id: 'data-agent',
  name: 'Data Agent',
  systemPrompt: '你是一个数据分析助手...',
  tools: [readFileTool, exploreDataTool, transformDataTool],
  convertToLlm: (messages) => messages.filter(m => ['user', 'assistant', 'tool'].includes(m.role)),
};
```

### 事件类型

| 事件 | 说明 |
|------|------|
| `agent_start` | Agent 开始执行 |
| `agent_end` | Agent 执行结束 |
| `turn_start` | 单轮对话开始 |
| `turn_end` | 单轮对话结束 |
| `message_start` | LLM 消息开始 |
| `message_update` | LLM 消息更新（流式） |
| `message_end` | LLM 消息结束 |
| `tool_execution_start` | 工具执行开始 |
| `tool_execution_end` | 工具执行结束 |
| `tool_result` | 工具执行结果 |
| `error` | 错误事件 |

## 依赖说明

本地 Python 环境需要：

- Python 3.x
- pandas
- numpy
- openpyxl（Excel 支持）
- scanpy（可选，用于更高级的单细胞分析）

## 当前限制

- WebSocket 当前用于会话状态同步，不做 token 级流式输出
- 仅完整实现了 `Data Agent + csv-skill + bioinfo-skill`
- `Model Agent` / `Analysis Agent` 仍未进入本阶段实现

## 架构演进

### 已完成的重构

1. **Agent Runtime 与业务逻辑分离**
   - 新增 `runtime/agent-loop.ts`，实现纯执行引擎
   - Agent 不再继承 BaseAgent，改为声明式配置
   - 支持事件流（agent_start, turn_start, message_update 等）

2. **声明式 Agent 配置**
   - DataAgent 改为声明 `systemPrompt`、`tools`、`convertToLlm`
   - 意图规则由各 Agent 声明，便于扩展

3. **Job Workspace 简化**
   - 目录扁平化：job 目录直接在 `data/` 下，去掉 `jobs/` 前缀
   - 文件合并：`trace.jsonl` 合并到 `job.json` 的 `traces` 数组
   - 状态内嵌：运行时状态存在 `job.json.state` 里
   - 删除冗余：移除 `session-store.ts`、`utils/data.ts`