# Task 01 · 核心平台搭建

## 目标

搭建 VerumOS 的核心平台框架，包括项目脚手架、Agent 框架、对话系统基础。

---

## 子任务

### 1.1 项目脚手架

```text
VerumOS/
├── src/
│   ├── server.ts           # HTTP 服务器入口
│   ├── app.ts              # 应用主逻辑
│   ├── config.ts           # 配置管理
│   ├── agents/
│   │   ├── index.ts        # Agent 注册表
│   │   ├── base.ts         # Agent 基类
│   │   └── types.ts        # Agent 类型定义
│   ├── skills/
│   │   ├── index.ts        # Skill 注册表
│   │   ├── base.ts         # Skill 基类
│   │   └── types.ts        # Skill 类型定义
│   ├── conversation/
│   │   ├── manager.ts      # 对话管理器
│   │   ├── context.ts      # 上下文管理
│   │   └── history.ts      # 历史记录
│   ├── execution/
│   │   ├── local.ts        # 本地执行器
│   │   └── remote.ts       # 远程执行器
│   ├── routes/
│   │   ├── chat.ts         # 对话 API
│   │   ├── data.ts         # 数据 API
│   │   ├── model.ts        # 模型 API
│   │   └── skill.ts        # Skill API
│   └── utils/
│       ├── logger.ts       # 日志工具
│       └── storage.ts      # 存储工具
├── web/
│   └── index.html          # 前端界面
├── skills/                 # Skill 实现目录
├── data/                   # 用户数据目录
├── package.json
├── tsconfig.json
└── .env.example
```

### 1.2 Agent 框架

```typescript
// src/agents/base.ts
export abstract class BaseAgent implements Agent {
  abstract id: string;
  abstract name: string;
  abstract description: string;
  
  abstract capabilities: AgentCapabilities;
  protected skills: Map<string, Skill> = new Map();
  
  // 注册 Skill
  registerSkill(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }
  
  // 处理消息
  abstract processMessage(
    message: string, 
    context: ConversationContext
  ): Promise<AgentResponse>;
  
  // 执行任务
  abstract executeTask(task: Task): Promise<TaskResult>;
  
  // 调用工具
  protected async callTool(
    skillName: string, 
    toolName: string, 
    params: any
  ): Promise<Result> {
    const skill = this.skills.get(skillName);
    if (!skill) throw new Error(`Skill not found: ${skillName}`);
    return skill.execute(toolName, params);
  }
}
```

### 1.3 Skill 框架

```typescript
// src/skills/base.ts
export abstract class BaseSkill implements Skill {
  abstract name: string;
  abstract description: string;
  abstract version: string;
  
  abstract capabilities: SkillCapabilities;
  abstract dependencies: SkillDependencies;
  abstract tools: Tool[];
  
  // 执行工具
  abstract execute(toolName: string, params: any): Promise<Result>;
  
  // 检查依赖
  async checkDependencies(): Promise<boolean> {
    // 检查 Python/Node 依赖是否安装
    return true;
  }
  
  // 安装依赖
  async installDependencies(): Promise<void> {
    // 自动安装缺失的依赖
  }
}
```

### 1.4 对话系统

```typescript
// src/conversation/manager.ts
export class ConversationManager {
  private sessions: Map<string, ConversationContext> = new Map();
  private agentRegistry: AgentRegistry;
  
  // 处理用户消息
  async handleMessage(
    sessionId: string, 
    message: string
  ): Promise<AgentResponse> {
    // 1. 获取或创建上下文
    const context = this.getOrCreateContext(sessionId);
    
    // 2. 添加用户消息到历史
    context.messages.push({ role: "user", content: message });
    
    // 3. 识别意图，路由到合适的 Agent
    const agent = await this.routeToAgent(message, context);
    
    // 4. Agent 处理消息
    const response = await agent.processMessage(message, context);
    
    // 5. 添加助手消息到历史
    context.messages.push({ role: "assistant", content: response });
    
    return response;
  }
  
  // Agent 路由
  private async routeToAgent(
    message: string, 
    context: ConversationContext
  ): Promise<Agent> {
    // 基于消息内容和上下文选择 Agent
    // 可以用 LLM 做意图分类
    return this.agentRegistry.getAgent("data-agent");
  }
}
```

### 1.5 执行器

```typescript
// src/execution/local.ts
export class LocalExecutor {
  // 执行 Python 代码
  async executePython(code: string, cwd?: string): Promise<ExecutionResult> {
    // 使用子进程执行 Python
    const result = await exec(`python3 -c "${code}"`, { cwd });
    return result;
  }
  
  // 执行 Shell 命令
  async executeShell(command: string, cwd?: string): Promise<ExecutionResult> {
    const result = await exec(command, { cwd });
    return result;
  }
}

// src/execution/remote.ts
export class RemoteExecutor {
  private sshConfig: SSHConfig;
  
  // 连接远程服务器
  async connect(): Promise<void> {
    // 使用 SSH2 连接
  }
  
  // 执行远程命令
  async execute(command: string): Promise<ExecutionResult> {
    // 在远程 Docker 容器中执行
  }
  
  // 上传文件
  async upload(localPath: string, remotePath: string): Promise<void> {
    // SFTP 上传
  }
  
  // 下载文件
  async download(remotePath: string, localPath: string): Promise<void> {
    // SFTP 下载
  }
}
```

---

## API 端点

```yaml
# 基础 API
GET  /health                 # 健康检查
GET  /                       # 前端界面

# 会话 API
POST /api/session            # 创建会话
GET  /api/session/:id        # 获取会话

# 对话 API
POST /api/chat               # 发送消息
GET  /api/chat/history       # 获取历史

# WebSocket
WS   /ws                     # 实时通信
```

---

## 验收标准

1. `pnpm dev` 启动无报错
2. `GET /health` 返回 `{"ok":true}`
3. `GET /` 返回前端界面
4. `POST /api/session` 创建会话成功
5. `POST /api/chat` 能收到响应（可以是简单回复）
6. WebSocket 连接成功

---

## 依赖

```json
{
  "dependencies": {
    "hono": "^4.12.8",
    "openai": "^4.85.0",
    "zod": "^3.24.0",
    "dotenv": "^17.3.0",
    "ssh2": "^1.15.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@hono/node-server": "^1.14.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0"
  }
}
```