# VerumOS 架构设计文档

## 1. 系统概述

VerumOS 是一个科研 AI 操作系统，通过对话式交互帮助科研人员完成数据处理、模型构建、结果分析等工作。

### 1.1 设计原则

1. **用户数据本地优先**：数据尽可能留在用户本地电脑
2. **可插拔架构**：Agent 和 Skill 都可以独立扩展
3. **对话式交互**：用户只需描述需求，AI 负责技术实现
4. **透明可控**：用户可以审查和修改 AI 生成的代码

### 1.2 核心组件

```
┌─────────────────────────────────────────────────────────────┐
│                      VerumOS Platform                        │
├─────────────────────────────────────────────────────────────┤
│  用户入口：Web UI / 飞书 / Discord / API                      │
├─────────────────────────────────────────────────────────────┤
│                      Agent Orchestrator                      │
│              (对话式任务编排 + 工作流引擎)                      │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  Data Agent  │ Model Agent  │Analysis Agent│  Extension...   │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                      Skill Registry                          │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ CSV Skill    │ PyTorch Skill│ PubMed Skill │  Extension...   │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                      Execution Runtime                        │
│         本地执行 (数据处理) / 远程集群 (模型训练)               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Agent 架构

### 2.1 Agent 接口定义

```typescript
interface Agent {
  // Agent 标识
  id: string;           // "data-agent"
  name: string;         // "数据助手"
  description: string;  // "帮助用户处理和整合数据"
  
  // 能力声明
  capabilities: {
    inputs: string[];   // 接受的输入类型
    outputs: string[];  // 产生的输出类型
    skills: string[];   // 可用的 Skills
  };
  
  // 对话处理
  processMessage(
    message: string, 
    context: ConversationContext
  ): Promise<AgentResponse>;
  
  // 任务执行
  executeTask(
    task: Task
  ): Promise<TaskResult>;
}

interface AgentResponse {
  type: "text" | "action" | "question" | "result";
  content: string;
  actions?: Action[];
  questions?: Question[];
  result?: any;
}
```

### 2.2 Data Agent（数据助手）

**职责**：数据搜集、探索、清洗、整合

```yaml
能力:
  - 自动识别数据格式
  - 探索数据内容
  - 与用户讨论数据整合方案
  - 执行数据清洗和转换
  - 多源数据整合

默认 Skills:
  - csv-skill: CSV/Excel 文件处理
  - json-skill: JSON/YAML 文件处理
  - sql-skill: 数据库连接和查询
  - bioinfo-skill: FASTA/BAM/VCF 等生信格式
  - geo-skill: GEO 数据集下载
  - tcga-skill: TCGA 数据获取

工作流:
  1. 用户上传数据或描述数据源
  2. Agent 自动识别格式并探索内容
  3. Agent 提出整合建议，与用户讨论
  4. 用户确认后执行整合
  5. 输出整合后的数据集
```

### 2.3 Model Agent（模型助手）

**职责**：AI 模型设计、训练、评估

```yaml
能力:
  - 与用户讨论模型设计方案
  - 自动生成模型代码
  - 训练和调参
  - 模型评估和解释
  - 模型部署建议

默认 Skills:
  - pytorch-skill: PyTorch 深度学习
  - sklearn-skill: 传统机器学习
  - transformers-skill: HuggingFace 模型
  - llm-skill: LLM 微调和部署

工作流:
  1. 用户描述建模需求
  2. Agent 分析数据特征，提出模型建议
  3. 与用户讨论模型架构
  4. 生成模型代码和训练脚本
  5. 用户确认后开始训练
  6. 输出训练结果和模型文件

执行环境:
  - 简单模型: 本地执行
  - 深度学习: 远程 GPU 集群
```

### 2.4 Analysis Agent（分析助手）

**职责**：调用工具、分析结果、生成报告

```yaml
能力:
  - 调用领域工具和数据库
  - 执行分析流程
  - 可视化结果
  - 生成分析报告

默认 Skills:
  - pubmed-skill: 文献检索
  - string-skill: 蛋白互作网络
  - blast-skill: 序列比对
  - enrichment-skill: 富集分析
  - survival-skill: 生存分析
  - visualization-skill: 数据可视化

工作流:
  1. 用户描述分析需求
  2. Agent 选择合适的工具和数据库
  3. 执行分析流程
  4. 可视化结果
  5. 生成分析报告
```

---

## 3. Skill 架构

### 3.1 Skill 接口定义

```typescript
interface Skill {
  // Skill 标识
  name: string;           // "csv-skill"
  description: string;    // "处理 CSV 和 Excel 文件"
  version: string;        // "1.0.0"
  author?: string;
  
  // 能力声明
  capabilities: {
    formats: string[];    // [".csv", ".xlsx", ".tsv"]
    operations: string[]; // ["read", "explore", "transform", "merge"]
  };
  
  // 依赖声明
  dependencies: {
    python?: string[];    // ["pandas>=2.0", "openpyxl"]
    node?: string[];      // []
    system?: string[];    // []
  };
  
  // 工具定义（给 LLM 调用）
  tools: Tool[];
  
  // 执行函数
  execute(toolName: string, params: any): Promise<Result>;
}

interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  returns: JSONSchema;
}
```

### 3.2 Skill 示例：csv-skill

```typescript
const csvSkill: Skill = {
  name: "csv-skill",
  description: "处理 CSV 和 Excel 文件",
  version: "1.0.0",
  
  capabilities: {
    formats: [".csv", ".xlsx", ".xls", ".tsv"],
    operations: ["read", "explore", "transform", "merge", "export"]
  },
  
  dependencies: {
    python: ["pandas>=2.0", "openpyxl"]
  },
  
  tools: [
    {
      name: "read_file",
      description: "读取 CSV 或 Excel 文件",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件路径" },
          sheet: { type: "string", description: "Excel sheet 名称（可选）" }
        },
        required: ["path"]
      }
    },
    {
      name: "explore_data",
      description: "探索数据内容，返回统计摘要",
      parameters: {
        type: "object",
        properties: {
          data_id: { type: "string", description: "数据集 ID" }
        },
        required: ["data_id"]
      }
    },
    {
      name: "merge_data",
      description: "合并多个数据集",
      parameters: {
        type: "object",
        properties: {
          data_ids: { type: "array", items: { type: "string" } },
          on: { type: "string", description: "合并键" },
          how: { type: "string", enum: ["inner", "left", "right", "outer"] }
        },
        required: ["data_ids", "on"]
      }
    }
  ],
  
  async execute(toolName: string, params: any): Promise<Result> {
    switch (toolName) {
      case "read_file":
        return await this.readFile(params.path, params.sheet);
      case "explore_data":
        return await this.exploreData(params.data_id);
      case "merge_data":
        return await this.mergeData(params.data_ids, params.on, params.how);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
};
```

---

## 4. 执行架构

### 4.1 本地执行

```yaml
适用场景:
  - 数据读取和探索
  - 数据清洗和转换
  - 简单模型训练
  - 结果可视化

执行方式:
  - Node.js 子进程
  - Python 虚拟环境
  - 沙箱隔离（可选）

数据存储:
  - 用户指定目录
  - 默认: ./data/{session_id}/
```

### 4.2 远程执行

```yaml
适用场景:
  - 深度学习模型训练
  - 大规模数据处理
  - GPU 计算任务

连接方式:
  SSH: ssh -CAXY {user}@{host}
  示例: ssh -CAXY aivc-gzy-debug2.gaozhangyang.ailab-beam.ws@h.pjlab.org.cn

执行流程:
  1. 用户确认使用远程集群
  2. 上传数据和代码到集群
  3. 在 Docker 容器中执行
  4. 实时返回训练进度
  5. 下载模型和结果

资源管理:
  - Docker 容器隔离
  - GPU 资源分配
  - 任务队列管理
```

---

## 5. 对话系统

### 5.1 对话流程

```
用户消息
    │
    ▼
┌─────────────┐
│ 意图识别    │ → 识别用户想做什么
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ Agent 路由  │ → 选择合适的 Agent
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ 上下文构建  │ → 加载历史对话、数据状态
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ Agent 处理  │ → Agent 生成响应
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ 工具调用    │ → 如需调用 Skill 工具
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ 响应生成    │ → 返回给用户
└─────────────┘
```

### 5.2 上下文管理

```typescript
interface ConversationContext {
  // 会话信息
  sessionId: string;
  userId: string;
  
  // 历史消息
  messages: Message[];
  
  // 数据状态
  datasets: Map<string, Dataset>;
  
  // 模型状态
  models: Map<string, Model>;
  
  // 任务状态
  tasks: Map<string, Task>;
  
  // 用户偏好
  preferences: UserPreferences;
}
```

---

## 6. API 设计

### 6.1 REST API

```yaml
# 会话管理
POST /api/session              # 创建会话
GET  /api/session/{id}         # 获取会话状态
DELETE /api/session/{id}        # 删除会话

# 对话
POST /api/chat                 # 发送消息
GET  /api/chat/history         # 获取历史消息

# 数据管理
POST /api/data/upload          # 上传数据
GET  /api/data/{id}            # 获取数据信息
GET  /api/data/{id}/explore    # 探索数据
DELETE /api/data/{id}          # 删除数据

# 模型管理
POST /api/model/create         # 创建模型
GET  /api/model/{id}           # 获取模型信息
POST /api/model/{id}/train     # 开始训练
GET  /api/model/{id}/status    # 训练状态
DELETE /api/model/{id}         # 删除模型

# 任务管理
GET  /api/task/{id}            # 获取任务状态
POST /api/task/{id}/cancel     # 取消任务

# Skill 管理
GET  /api/skills               # 列出可用 Skills
GET  /api/skills/{name}        # 获取 Skill 详情
```

### 6.2 WebSocket API

```yaml
# 实时通信
ws://localhost:3000/ws

消息类型:
  - chat: 对话消息
  - progress: 任务进度
  - log: 执行日志
  - error: 错误通知
```

---

## 7. 安全考虑

### 7.1 数据安全

- 用户数据存储在本地，不上传到云端
- 远程训练时，数据加密传输
- 敏感数据可配置脱敏处理

### 7.2 执行安全

- 本地执行使用沙箱隔离
- 远程执行使用 Docker 容器
- 代码执行前进行安全检查

### 7.3 访问控制

- 本地服务默认只监听 localhost
- 可配置认证机制
- 远程集群使用 SSH 密钥认证

---

## 8. 扩展机制

### 8.1 添加新 Agent

```typescript
// 1. 实现 Agent 接口
class MyAgent implements Agent {
  id = "my-agent";
  name = "我的助手";
  // ...
}

// 2. 注册到系统
registry.registerAgent(new MyAgent());
```

### 8.2 添加新 Skill

```typescript
// 1. 实现 Skill 接口
class MySkill implements Skill {
  name = "my-skill";
  // ...
}

// 2. 注册到系统
registry.registerSkill(new MySkill());

// 3. 关联到 Agent
registry.assignSkillToAgent("my-skill", "my-agent");
```

---

## 9. 技术选型

| 层次 | 选型 | 说明 |
|------|------|------|
| 前端 | HTML/CSS/JS | 可扩展为 React/Vue |
| 后端 | TypeScript + Hono | 轻量级 HTTP 框架 |
| Agent 编排 | LangChain / 自研 | LLM 调用和工具编排 |
| 本地执行 | Node.js + Python | 子进程调用 |
| 远程执行 | SSH2 + Docker | 远程命令执行 |
| 数据存储 | 本地文件系统 | SQLite 元数据 |
| 实时通信 | WebSocket | 进度和日志推送 |