# VerumOS · 明鉴

**科研 AI 操作系统** — 让每一位科研人员都能轻松使用 AI

---

## 项目愿景

VerumOS 是一个面向科研人员的 AI 辅助平台，让科学家能够：

- 📊 **轻松处理数据**：自动识别格式、探索内容、整合多源数据
- 🧠 **快速构建模型**：对话式设计 AI 模型，自动生成代码并训练
- 🔬 **智能分析结果**：调用领域工具和数据库，生成可信结论

**核心理念**：科研人员只需描述需求，AI 负责技术实现。

---

## 当前状态

| 模块 | 状态 |
|------|------|
| 架构设计 | ✅ 已完成 |
| 前端 Demo | ✅ 已完成 |
| 实现计划 | ✅ 已完成 |
| 后端实现 | 🔲 待开发 |

---

## 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│                      VerumOS Platform                        │
│                    科研 AI 操作系统                           │
├─────────────────────────────────────────────────────────────┤
│  用户入口：Web UI / 飞书 / Discord / API                      │
├─────────────────────────────────────────────────────────────┤
│                      Agent Orchestrator                      │
│              (对话式任务编排 + 工作流引擎)                      │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  Data Agent  │ Model Agent  │Analysis Agent│  ... 更多 Agent │
│  数据处理    │  模型构建    │  结果分析     │                │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                      Skill Registry                          │
│                   (可插拔技能注册表)                           │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ CSV Skill    │ PyTorch Skill│ PubMed Skill │  ... 更多 Skill │
│ Excel Skill  │ Sklearn Skill│ STRING Skill │                │
│ FASTA Skill  │ LLM Finetune │ BLAST Skill  │                │
│ SQL Skill    │ ...          │ ...          │                │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                      Execution Runtime                        │
│         本地执行 (数据处理) / 远程集群 (模型训练)               │
└─────────────────────────────────────────────────────────────┘
```

### 三大核心 Agent

#### 1. Data Agent（数据助手）

**职责**：数据搜集、探索、清洗、整合

- 自动识别数据格式（CSV、Excel、JSON、FASTA、VCF、HDF5...）
- 探索数据内容（统计摘要、分布、缺失值、异常值）
- 与用户讨论数据整合方案
- 执行数据清洗和转换
- 多源数据整合

**可插拔 Skills**：csv-skill, sql-skill, bioinfo-skill, geo-skill, tcga-skill...

#### 2. Model Agent（模型助手）

**职责**：AI 模型设计、训练、评估

- 与用户讨论模型设计方案
- 自动生成模型代码
- 训练和调参
- 模型评估和解释
- 模型部署建议

**可插拔 Skills**：pytorch-skill, sklearn-skill, transformers-skill, llm-skill...

#### 3. Analysis Agent（分析助手）

**职责**：调用工具、分析结果、生成报告

- 调用领域工具和数据库
- 执行分析流程
- 可视化结果
- 生成分析报告

**可插拔 Skills**：pubmed-skill, string-skill, blast-skill, enrichment-skill...

---

## 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                      用户本地电脑                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │  Web UI     │◄──►│ VerumOS     │◄──►│  数据文件   │      │
│  │  (浏览器)   │    │  本地服务   │    │  (本地存储) │      │
│  └─────────────┘    └──────┬──────┘    └─────────────┘      │
│                            │                                │
│                            │ SSH (模型训练时)                │
│                            ▼                                │
└────────────────────────────┼────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      远程计算集群                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │  Docker     │    │   GPU       │    │  模型存储   │      │
│  │  容器       │    │   资源      │    │             │      │
│  └─────────────┘    └─────────────┘    └─────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

**设计原则**：
- 用户数据尽可能留在本地
- 数据处理在本地执行
- 深度学习模型训练在远程集群执行
- 通过 SSH 连接远程 Docker 容器

---

## 项目结构

```text
VerumOS/
├── web/
│   └── index.html              # 前端 Demo
├── plan/
│   ├── README.md               # 架构设计文档
│   ├── architecture.md         # 详细架构说明
│   ├── task-01-core-platform.md
│   ├── task-02-data-agent.md
│   ├── task-03-model-agent.md
│   ├── task-04-analysis-agent.md
│   ├── task-05-skill-system.md
│   ├── task-06-remote-execution.md
│   └── task-07-integrations.md
├── src/                        # 后端代码（待实现）
├── skills/                     # 可插拔技能（待实现）
├── README.md                   # 本文件
└── prompt.md                   # 开发指令
```

---

## 用户工作流示例

```
用户: 我有一份肝癌 RNA-seq 数据（CSV）和一份临床信息（Excel），
     想构建一个预测患者预后的深度学习模型。

VerumOS:
  [Data Agent] 我来帮你探索这两份数据...
  
  📊 RNA-seq 数据 (expression.csv):
     - 373 样本 × 20,531 基因
     - 格式: TPM normalized
     
  📊 临床数据 (clinical.xlsx):
     - 373 患者 × 15 特征
     - 关键字段: OS_time, OS_status, Age, Stage...
     
  🔗 整合建议:
     1. 用患者 ID 关联两份数据
     2. 过滤低表达基因
     3. 标准化临床特征
     
  你想按这个方案整合吗？

用户: 可以，但我还想加入 TCGA-LIHC 数据

VerumOS:
  [Data Agent] 好的，我来下载 TCGA-LIHC 数据...
  ✅ 数据整合完成: 797 样本
  
  [Model Agent] 现在来讨论模型设计...
  
  🧠 建议模型架构:
     - Transformer 编码器处理基因表达
     - MLP 融合临床特征
     - Cox loss 预测生存
     
  你想用这个架构吗？

用户: 用 Transformer，加入注意力可视化

VerumOS:
  [Model Agent] 好的，我来生成代码...
  ✅ 模型代码已生成
  
  需要在远程集群训练吗？（本地数据将上传到集群）

用户: 开始训练

VerumOS:
  [Model Agent] 连接远程集群...
  ✅ 训练完成！C-index: 0.82
  
  [Analysis Agent] 分析结果...
  📊 关键基因: TP53, BRCA1, CDK4
  📝 结论: 模型识别的关键基因与肝癌预后通路一致
```

---

## 技术栈

| 层次 | 选型 |
|------|------|
| 前端 | HTML/CSS/JS (可扩展为 React/Vue) |
| 后端 | TypeScript + Hono |
| Agent 编排 | LangChain / 自研 |
| 本地执行 | Node.js + Python |
| 远程执行 | SSH + Docker |
| 数据存储 | 本地文件系统 |
| 模型训练 | PyTorch + GPU 集群 |

---

## 开发计划

详见 `plan/` 目录，按以下顺序推进：

| 阶段 | 任务 | 说明 |
|------|------|------|
| Phase 1 | 核心平台 | 项目脚手架、Agent 框架、对话系统 |
| Phase 2 | Data Agent | 数据探索、格式识别、Skills 开发 |
| Phase 3 | Model Agent | 模型设计、代码生成、远程训练 |
| Phase 4 | Analysis Agent | 工具调用、结果分析、报告生成 |
| Phase 5 | 集成优化 | 飞书/Discord、性能优化、文档完善 |

---

## 与 openclaw 的关系

VerumOS 可作为 openclaw 的一个 skill 或独立服务运行：

- 复用 openclaw 的消息渠道（飞书、Discord）
- 复用 openclaw 的 Plugin SDK
- 独立的 Agent 编排和执行引擎

---

## License

MIT