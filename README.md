# VerumOS · 明鉴

科研 AI 操作系统的 Phase 1 最小可运行版本。

## 当前实现

### 核心功能
- **Data Agent**：数据探索、清洗、整合，支持需求文档驱动的工作流
- **csv-skill**：CSV/TSV/Excel 文件处理，支持读取、探索、转换、合并、转置
- **bioinfo-skill**：生物信息学分析，支持单细胞表达矩阵处理、QC、标准化、marker 基因分析
- **需求文档系统**：支持 Markdown 格式的需求文档，自动生成工具链

### API 端点
- `POST /api/session` - 创建会话
- `GET /api/session/:id` - 获取会话状态
- `POST /api/chat` - 发送消息
- `POST /api/upload` - 上传文件
- `GET/POST /api/requirement/:sessionId` - 需求文档管理
- `GET /api/requirement/:sessionId/toolchain` - 获取工具链
- `GET /api/files` - 列出已上传文件
- `GET /health` - 健康检查
- `WS /ws` - WebSocket 会话同步

### 前端功能
- 双栏布局：左侧聊天区 + 右侧需求文档/工具链/数据集面板
- 数据预览表格：显示前 20 行，支持横向滚动，列类型标注
- 需求文档编辑器：Markdown 编辑 + 实时保存
- 工具链预览：自动生成推荐工具链

## 项目结构

```text
VerumOS/
├── data/                     # 运行时数据目录
│   └── 需求文档_单细胞分析.md  # 示例需求文档
├── skills/
│   ├── csv-skill/
│   │   └── SKILL.md         # CSV Skill 描述文件
│   └── bioinfo-skill/
│       └── SKILL.md         # Bioinfo Skill 描述文件
├── src/
│   ├── agents/              # Agent 基类、类型、Data Agent
│   │   ├── base.ts          # Agent 基类
│   │   ├── data-agent.ts    # Data Agent 实现
│   │   ├── requirement-doc.ts # 需求文档管理
│   │   └── types.ts         # 类型定义
│   ├── execution/           # 本地 Python 执行器
│   ├── routes/              # API 路由
│   │   ├── chat.ts          # 聊天 API
│   │   ├── upload.ts        # 文件上传 API
│   │   └── requirement.ts   # 需求文档 API
│   ├── skills/              # Skill 运行时
│   │   ├── csv-skill.ts     # CSV Skill 实现
│   │   ├── bioinfo-skill.ts # Bioinfo Skill 实现
│   │   └── index.ts         # Skill 注册表
│   ├── utils/               # 工具函数
│   ├── ws/                  # WebSocket 服务
│   ├── app.ts               # Hono app
│   ├── config.ts            # 环境配置
│   ├── server.ts            # 服务入口
│   └── session-store.ts     # 内存会话存储
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

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LLM_API_KEY` | 中转站 API Key | - |
| `LLM_BASE_URL` | 中转站 API 地址 | `http://35.220.164.252:3888/v1/` |
| `LLM_MODEL` | 模型名称 | `glm-5` |
| `PORT` | 服务端口 | `3000` |
| `DATA_DIR` | 运行时数据目录 | `./data` |
| `PYTHON_PATH` | Python 解释器路径 | `/opt/homebrew/Caskroom/miniconda/base/bin/python` |

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
| `read_file` | 读取 CSV/TSV/Excel 文件 |
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

## 依赖说明

本地 Python 环境需要：

- Python 3.x
- pandas
- numpy
- openpyxl（Excel 支持）
- scanpy（可选，用于更高级的单细胞分析）

## 当前限制

- 会话存储仍为内存实现，重启后不会保留
- WebSocket 当前用于会话状态同步，不做 token 级流式输出
- 仅完整实现了 `Data Agent + csv-skill + bioinfo-skill`
- `Model Agent` / `Analysis Agent` 仍未进入本阶段实现