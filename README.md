# VerumOS · 明鉴

科研 AI 操作系统。

## 当前实现

### 核心功能
- **Data Agent**：数据探索、清洗、整合，支持需求文档驱动的工作流
- **Analysis Agent**：统计分析、可视化图表生成、SCP Hub 工具集成
- **csv-skill**：CSV/TSV/Excel 文件处理，支持读取、探索、转换、合并、转置
- **bioinfo-skill**：生物信息学分析，支持单细胞表达矩阵处理、QC、标准化、marker 基因分析
- **需求文档系统**：支持 Markdown 格式的需求文档，自动生成工具链
- **Job Workspace**：任务隔离、持久化、执行轨迹记录、任务恢复
- **SCP 工具池**：集成 25 个 SCP Hub 服务，2302 个科研工具

### 架构亮点
- **Agent Runtime**：核心执行引擎（agentLoop），支持事件流、工具调用编排
- **声明式 Agent 配置**：Agent 只声明 systemPrompt、tools、convertToLlm，不继承执行引擎
- **Agent Registry**：支持多 Agent 注册和意图路由
- **Skill Registry**：支持多 Skill 注册和管理
- **意图规则声明式定义**：意图识别规则由各 Agent 声明，便于扩展和维护

### SCP Hub 工具集成

Analysis Agent 集成了 SCP Hub 的 25 个生命科学服务，总计 2302 个工具：

#### 🧬 药物研发 (3 个服务)
- **DrugSDA-Tool** (28,600 工具): 分子筛选、格式转换、相似度计算
- **DrugSDA-Model** (1,700 工具): 分子对接、ADMET 预测、亲和力预测
- **Origene-FDADrug** (57 工具): FDA 药品信息检索

#### 🧪 蛋白质工程 (4 个服务)
- **VenusFactory** (1,500 工具): 蛋白质突变预测、功能预测
- **BioInfo-Tools** (55 工具): 序列分析、结构域识别、GO 注释
- **Origene-UniProt** (121 工具): UniProt 数据库检索
- **Origene-STRING** (6 工具): 蛋白质相互作用网络

#### 🧫 基因组学 (4 个服务)
- **Origene-Ensembl** (14 工具): 基因组注释
- **Origene-UCSC** (12 工具): 基因组可视化
- **Origene-NCBI** (9 工具): NCBI 数据库检索
- **Origene-TCGA** (8 工具): 癌症基因组数据

#### 🔬 疾病与靶点 (2 个服务)
- **Origene-OpenTargets** (189 工具): 靶点发现与验证
- **Origene-Monarch** (49 工具): 疾病-基因关联

#### ⚗️ 化学与分子 (3 个服务)
- **Origene-ChEMBL** (47 工具): 生物活性数据库
- **Origene-PubChem** (306 工具): 化学信息数据库
- **Origene-KEGG** (10 工具): 代谢通路数据库

#### ⚗️ 化学计算 (2 个服务)
- **SciToolAgent-Chem** (505 工具): 化学反应预测、逆合成规划
- **化学与反应计算** (276 工具): 化学计算工具

#### 🧪 湿实验操作 (1 个服务)
- **Thoth** (1,300+ 工具): 实验流程自动生成

#### 🔍 综合工具 (3 个服务)
- **SciToolAgent-Bio** (40 工具): 生物信息学工具集
- **SciGraph-Bio** (56 工具): 生命科学知识图谱
- **Origene-Search** (6 工具): 文献检索

#### 🌐 通用工具 (3 个服务)
- **SciGraph** (4,800 工具): 跨学科知识图谱
- **ToolUniverse** (236 工具): 工具集成平台
- **数据处理与统计分析** (320 工具): 数据处理与统计

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
- `GET /api/files/tree` - 获取目录树结构
- `GET /api/files/content` - 读取文件内容
- `POST /api/files/mkdir` - 创建文件夹
- `POST /api/files/create` - 创建文件
- `DELETE /api/files` - 删除文件或文件夹
- `PATCH /api/files/rename` - 重命名文件或文件夹
- `POST /api/files/upload` - 上传文件到指定目录
- **快照 API**：
  - `GET /api/jobs/:jobId/snapshots` - 列出快照
  - `POST /api/jobs/:jobId/snapshots` - 手动创建快照
  - `GET /api/jobs/:jobId/snapshots/:snapId` - 获取快照详情
  - `POST /api/jobs/:jobId/snapshots/:snapId/revert` - 回退到快照
  - `PUT /api/jobs/:jobId/messages/:index` - 编辑历史消息
- `GET /health` - 健康检查
- `WS /ws` - WebSocket 会话同步

### 前端功能
- 三栏布局：左侧 Job Explorer + 中间聊天区 + 右侧面板
- **Job Explorer**：VSCode 风格文件浏览器
  - 树形结构展示，支持展开/折叠
  - 右键上下文菜单（打开、重命名、删除、下载）
  - 新建文件夹、上传文件
  - 文件预览（CSV、JSON、TXT、MD 等）
- **工具池**：Analysis Agent 专属面板
  - 25 个 SCP Hub 服务展示
  - 分类过滤（药物研发、蛋白质工程、基因组学等）
  - 搜索功能
  - 批量选择/取消激活
  - 详细使用说明和示例
- **数据预览表格**：显示前 20 行，支持横向滚动，列类型标注
- **需求文档编辑器**：Markdown 编辑 + 实时保存
- **工具链预览**：自动生成推荐工具链
- **快照功能**：
  - 编辑历史消息：用户消息悬停显示编辑按钮
  - 两种编辑模式：仅修改记录 / 回退并重新执行
  - 自动快照：关键操作前后自动创建快照
  - 快照列表：文件树中显示快照节点
  - 快照查看：点击快照查看详情（需求文档、分析脚本）
  - 版本回退：可回退到任意快照版本

## 项目结构

```text
VerumOS/
├── data/                     # 运行时数据目录
│   └── job_YYYYMMDD_HHMM_xxx/  # 任务 workspace（直接在 data/ 下）
│       ├── job.json          # 任务元数据 + 轨迹 + 状态（一个文件搞定）
│       ├── snapshots/        # 快照目录
│       ├── inputs/           # 输入文件
│       └── outputs/          # 输出文件
├── skills/
│   ├── csv-skill/
│   │   └── SKILL.md         # CSV Skill 描述文件
│   └── bioinfo-skill/
│       └── SKILL.md         # Bioinfo Skill 描述文件
├── src/
│   ├── core/                # 核心层（新架构）
│   │   ├── types.ts         # 核心类型：AgentDef, MemoryPolicy, AgentEvent 等
│   │   ├── index.ts         # Core 服务容器入口
│   │   ├── router.ts        # 两级路由（规则 + LLM 语义）
│   │   ├── event-bus.ts     # 事件发布/订阅
│   │   ├── registry/
│   │   │   └── tool-registry.ts  # 工具注册表
│   │   └── memory/
│   │       ├── index.ts           # MemoryManager 入口
│   │       ├── working-memory.ts  # 消息历史 + token 截断
│   │       ├── job-memory.ts      # job 上下文注入
│   │       └── long-term-memory.ts # 长期记忆（Phase 2）
│   ├── agents/              # Agent 实现（声明式配置）
│   │   ├── data-agent.ts    # Data Agent 配置 + 处理器
│   │   ├── analysis-agent.ts # Analysis Agent 配置
│   │   ├── requirement-doc.ts # 需求文档管理
│   │   └── types.ts         # 类型定义
│   ├── runtime/             # 核心 Runtime（纯执行引擎）
│   │   ├── agent-loop.ts    # 核心循环：async generator
│   │   ├── agent-runtime.ts # 执行引擎
│   │   ├── intent-classifier.ts # 意图分类器
│   │   └── llm-client.ts    # LLM 调用抽象
│   ├── registry/            # 注册表
│   │   ├── agent-registry.ts # Agent 注册表
│   │   └── skill-registry.ts # Skill 注册表
│   ├── job/                 # 任务管理
│   │   ├── types.ts         # Job 类型定义
│   │   ├── manager.ts       # Job 管理器
│   │   └── snapshot-manager.ts # 快照管理器
│   ├── execution/           # 本地 Python 执行器
│   ├── routes/              # API 路由
│   ├── skills/              # Skill 运行时
│   ├── ws/                  # WebSocket 服务
│   ├── app.ts               # Hono app
│   ├── config.ts            # 环境配置
│   └── server.ts            # 服务入口
├── web/
│   └── index.html           # 前端 Demo
├── prompt.md                # 开发方案文档
├── tool.md                  # SCP Hub 工具清单
├── debug.md                 # 架构设计文档
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

### 4. 使用 SCP 工具

切换到 Analysis Agent，查看工具池：

1. 点击顶部导航的"分析"标签
2. 右侧面板显示"工具池"标签
3. 浏览 25 个 SCP Hub 服务
4. 点击"📋 查看详情"查看使用说明
5. 勾选需要的工具并保存

### 如何使用 SCP 工具

1. **配置 API 密钥**：在 `.env` 文件中设置 `SCP_API_KEY`
   ```bash
   SCP_API_KEY=sk-35a787a0-98f2-4e39-94ae-416a43c38dc2
   SCP_BASE_URL=https://scphub.intern-ai.org.cn
   ```

2. **启动服务**：`pnpm dev`

3. **切换到 Analysis Agent**：点击顶部导航的"分析"标签

4. **查看工具池**：右侧面板显示"工具池"标签

5. **浏览和选择工具**：
   - 使用分类过滤器筛选
   - 使用搜索框查找特定工具
   - 点击"📋 查看详情"查看使用说明
   - 勾选需要的工具

6. **激活工具**：点击"保存选择"按钮激活工具

7. **使用工具**：
   - **方式一**：在聊天中直接描述需求，系统会自动调用相应的 SCP 工具
   - **方式二**：通过 API 直接调用
     ```bash
     curl -X POST http://localhost:3000/api/scp/invoke \
       -H "Content-Type: application/json" \
       -d '{
         "tool_id": "DrugSDA-Tool",
         "action": "format_convert",
         "parameters": {
           "input": "CCO",
           "output_format": "sdf"
         }
       }'
     ```

8. **测试连接**：
   ```bash
   curl http://localhost:3000/api/scp/test
   ```

## Data Agent 能力

当前支持：

- `upload`：上传或按路径读取 `csv/tsv/xlsx/xls`
- `explore`：返回 shape、columns、missing、quality、preview
- `question`：回答行数、列数、列名等基础问题
- `transform`：数据转换（`filter` / `normalize` / `log2`）
- `merge`：支持两份表格按公共列合并
- `requirement`：需求讨论，**LLM 驱动的任务分解和代码生成**
- `execute`：执行已确认的分析方案

### LLM 驱动的数据处理

系统使用 LLM 来：
1. **理解需求文档**：解析数据源、处理目标、输出要求
2. **预分析数据结构**：读取列名、形状、样本数据
3. **生成处理代码**：根据需求和数据结构生成完整的 Python 代码
4. **执行并验证**：运行代码并检查输出文件

## Analysis Agent 能力

当前支持：

- **统计分析**：描述性统计、假设检验、相关性分析
- **可视化**：折线图、柱状图、散点图、热力图、火山图等
- **SCP Hub 工具集成**：调用 25 个服务的 2302 个工具

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
├── job.json          # 元数据 + 轨迹 + 状态 + 快照索引
├── snapshots/        # 快照目录
│   ├── snap_001.json # 快照内容（状态 + 代码文件）
│   └── snap_002.json
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

### 快照功能

**快照边界**：只存储状态和代码，不存储数据文件

| 进快照 | 不进快照 |
|--------|----------|
| `requirement.md` | `inputs/*.csv` |
| `analysis.py` | `outputs/*.csv` |
| `state.messages` | |
| `state.datasets`（元信息） | |

**快照触发时机**：
- 自动触发：需求文档保存、执行分析前后、上传文件后
- 手动触发：用户点击"创建快照"

**编辑历史消息**：
- 仅修改记录：保留当前状态，只修改历史
- 回退并重新执行：恢复到该消息时的状态，裁剪后续消息

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
- `Model Agent` 仍未进入本阶段实现
- SCP 工具当前仅展示和选择，实际调用功能待实现

## 架构演进

### 已完成的重构（Phase 1-7）

#### 1. 核心类型定义（Core Types）
- 新增 `src/core/types.ts`，定义核心类型：`AgentDef`、`MemoryPolicy`、`AgentContext`、`AgentEvent`、`RouteRule`、`ToolDef` 等
- `AgentDef` 是 Core 层和 Application 层之间的唯一合同
- 定义 interfaces for Router, Memory, EventBus, SkillRegistry, ToolRegistry, JobManager

#### 2. SkillRegistry 增强
- 新增 `resolve` 方法：将 skill id 列表解析为 tools + SKILL.md 文档
- 支持 Skill 到 SkillDef 的自动转换
- SKILL.md 内容可追加到 system prompt

#### 3. ToolRegistry 实现
- 新增 `src/core/registry/tool-registry.ts`
- 管理所有 Tool 的注册和执行
- 支持 OpenAI function calling 格式输出

#### 4. Memory 层抽象
- 新增 `src/core/memory/` 目录
- WorkingMemory: 消息历史 + token 截断（优先保留 system 和最新用户消息）
- JobMemory: job 结构化状态注入（数据集元信息、需求文档、执行轨迹）
- LongTermMemory: 接口预留，Phase 2 实现向量检索
- MemoryManager: 组合三层 Memory，提供统一接口

#### 5. Router 实现
- 新增 `src/core/router.ts`
- 两级路由：规则路由（优先）→ LLM 语义路由（fallback）
- AgentRegistry 增强：支持 AgentDef 注册和路由规则汇总

#### 6. EventBus 实现
- 新增 `src/core/event-bus.ts`
- 发布/订阅模式，解耦事件源和处理者
- 支持同步和异步处理器
- 快照自动触发：订阅 `requirement.saved`、`analysis.before_execute` 等事件

#### 7. 应用层 Agent 纯化
- DataAgentDef 改为纯配置对象，符合 debug.md 架构设计
- 声明 `systemPrompt`、`skills`、`routes`、`memoryPolicy`、`hooks`
- 通过 hooks 表达个性化行为（convertToLlm、beforeTurn）
- 保留向后兼容的 DataAgentProcessor

#### 8. Core 服务容器
- 新增 `src/core/index.ts`，提供 `createCoreServices()` 入口
- `initializeCoreServices()` 注册内置 Skills 和事件订阅
- 快照自动触发：通过 EventBus 订阅实现

#### 9. AgentLoop 集成与 EventBus 订阅者
- 重构 `agentLoop` 接受 CoreServices 注入
- 使用 MemoryManager 组装上下文、SkillRegistry 解析工具
- 新增 `src/core/subscribers/` 目录：
  - **TraceRecorder**：订阅 tool 事件，自动记录执行轨迹
  - **WsPublisher**：订阅所有事件，推送到 WebSocket 客户端
- 渐进式引入 EventBus：
  - routes 层保留直接调用 + 发布事件（双写）
  - 验证稳定后移除直接调用
- 在 `app.ts` 初始化时调用 `initializeCoreServices()`

#### 10. Analysis Agent 与工具池
- 实现 Analysis Agent，支持统计分析和可视化
- 集成 SCP Hub 的 25 个服务，共 2302 个工具
- 前端工具池界面：分类过滤、搜索、批量选择、详情查看
- 每个工具包含详细使用说明和示例

### 待完成（后续 Phase）

- **LongTermMemory**：实现向量检索（Phase 2）
- **SCP 工具实际调用**：实现工具调用器，连接 SCP Hub API

### 架构设计原则
```
┌──────────────────────────────────────────────────────────────┐
│                      Application Layer                        │
│                                                               │
│   DataAgentDef     ModelAgentDef     AnalysisAgentDef  ...   │
│                                                               │
│            每个 agent 只是一个 AgentDef 配置对象              │
└───────────────────────────┬──────────────────────────────────┘
                            │ AgentDef（唯一跨层接口）
┌───────────────────────────▼──────────────────────────────────┐
│                         Core Layer                            │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                      Router                           │    │
│  │      规则路由（优先）→ LLM 语义路由（fallback）        │    │
│  └─────────────────────────┬────────────────────────────┘    │
│                            │                                  │
│  ┌─────────────────────────▼────────────────────────────┐    │
│  │                    AgentLoop                          │    │
│  │             核心执行引擎（async generator）            │    │
│  └──┬──────────┬─────────────┬──────────┬───────────────┘    │
│     │          │             │          │                     │
│  Memory  ToolRegistry  SkillRegistry  JobManager              │
│                                                               │
│  LLMClient                EventBus                           │
└──────────────────────────────────────────────────────────────┘
```
- **Application 层**：只输出 AgentDef 配置对象，无 class，无运行时状态
- **Core 层**：只消费 AgentDef，不 import Application 层模块
- **EventBus**：观测旁路，不是控制流；状态变更走直接调用，EventBus 影子发布

## 重要
目前web应用端口是:http://localhost:3000/
调试端口是: http://localhost:7681/