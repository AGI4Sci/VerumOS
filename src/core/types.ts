/**
 * Core Types - VerumOS 核心类型定义
 *
 * 这些类型是 Core 层和 Application 层之间的唯一合同。
 * 所有跨层数据结构都应该使用这些类型。
 */

import type { Dataset, DatasetMetadata } from '../agents/types.js';

/**
 * Agent 定义 - 唯一跨层合同
 *
 * Application 层 agent 只输出一个 AgentDef 配置对象。
 * Core 层只消费 AgentDef。
 */
export interface AgentDef {
  // 身份
  id: string;
  name: string;
  description: string;          // Router 语义匹配用，自然语言描述能力边界

  // 行为
  systemPrompt: string;
  skills: string[];             // skill id 列表，从 SkillRegistry 解析
  tools?: ToolDef[];            // agent 私有工具（可选，不经过 SkillRegistry）

  // 路由
  routes?: RouteRule[];         // 应用层固定路由规则（优先于语义路由）

  // 记忆策略
  memoryPolicy?: MemoryPolicy;  // 声明需要哪些 memory，由 AgentLoop 负责注入

  // 生命周期钩子（agent 个性化逻辑的唯一出口）
  hooks?: AgentHooks;
}

/**
 * 路由规则
 */
export interface RouteRule {
  match: {
    intent?: string[];          // 精确意图匹配
    pattern?: RegExp;           // 正则匹配
    condition?: (msg: string, ctx: SessionContext) => boolean;
  };
  priority?: number;            // 数值越大优先级越高，默认 0
}

/**
 * 记忆策略
 */
export interface MemoryPolicy {
  workingMemory?: WorkingMemoryPolicy;
  jobMemory?: JobMemoryPolicy;
  longTermMemory?: LongTermMemoryPolicy;
}

/**
 * Working Memory 策略
 */
export interface WorkingMemoryPolicy {
  maxMessages?: number;       // 保留最近 N 条消息
  maxTokens?: number;         // token 预算上限
}

/**
 * Job Memory 策略
 */
export interface JobMemoryPolicy {
  includeDatasetMeta?: boolean;
  includeRequirementDoc?: boolean;
  includeRecentTraces?: number;   // 保留最近 N 条执行轨迹
}

/**
 * Long Term Memory 策略
 */
export interface LongTermMemoryPolicy {
  enabled?: boolean;
  topK?: number;              // 检索最相关的 K 条记忆
}

/**
 * Agent 钩子 - agent 个性化逻辑的唯一出口
 */
export interface AgentHooks {
  beforeTurn?: (ctx: AgentContext) => Promise<AgentContext>;
  afterToolCall?: (result: ToolResult, ctx: AgentContext) => Promise<void>;
  convertToLlm?: (messages: Message[]) => Message[];  // 上下文压缩策略
}

/**
 * 工具定义 - LLM 可 function_call 的原子操作
 */
export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
  execute: (params: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

/**
 * 工具上下文 - 工具执行时的环境信息
 */
export interface ToolContext {
  jobId: string;
  sessionId: string;
  datasets: Map<string, Dataset>;
  activeDatasetId?: string;
  jobDir?: string;
  outputsDir?: string;
}

/**
 * Agent 运行时上下文
 */
export interface AgentContext {
  jobId: string;
  sessionId: string;
  messages: Message[];
  datasets: Map<string, Dataset>;
  activeDatasetId?: string;
  systemPromptSuffix?: string;
  currentIntent?: IntentInfo;
}

/**
 * 意图信息
 */
export interface IntentInfo {
  type: string;
  confidence: number;
  params?: Record<string, unknown>;
  datasetId?: string;
}

/**
 * 消息
 */
export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

/**
 * 工具调用
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * 工具结果
 */
export interface ToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  error?: string;
}

/**
 * Agent 事件类型
 *
 * EventBus 是观测旁路，不是控制流。
 * 核心状态变更走直接调用，EventBus 是这些调用完成后的"影子发布"。
 */
export type AgentEventType =
  | 'agent_start' | 'agent_end'
  | 'turn_start' | 'turn_end'
  | 'message_start' | 'message_update' | 'message_end'
  | 'tool_execution_start' | 'tool_execution_end' | 'tool_result'
  | 'requirement.saved'
  | 'analysis.before_execute' | 'analysis.after_execute'
  | 'file.uploaded'
  | 'error';

/**
 * Agent 事件
 */
export interface AgentEvent<T = unknown> {
  type: AgentEventType;
  timestamp: string;
  jobId?: string;
  sessionId?: string;
  data?: T;
}

/**
 * 路由结果
 */
export interface RouterResult {
  agentId: string;
  matchedBy: 'rule' | 'llm' | 'default';
  confidence?: number;
}

/**
 * 会话上下文
 */
export interface SessionContext {
  sessionId: string;
  jobId?: string;
  messages: Message[];
  datasets: Map<string, Dataset>;
  activeDatasetId?: string;
}

/**
 * Core 服务容器 - 注入到 AgentLoop
 *
 * AgentLoop 不自己 import 任何 core 模块，通过这个容器接收依赖。
 */
export interface CoreServices {
  memory: MemoryManager;
  toolRegistry: ToolRegistry;
  skillRegistry: SkillRegistry;
  jobManager: JobManager;
  llmClient: LLMClient;
  eventBus: EventBus;
}

/**
 * Memory 管理器接口
 */
export interface MemoryManager {
  assemble(policy: MemoryPolicy, jobId: string, messages: Message[]): Promise<MemoryBundle>;
  appendTrace(jobId: string, trace: TraceEntry): Promise<void>;
}

/**
 * Memory 捆绑包
 */
export interface MemoryBundle {
  truncatedMessages: Message[];   // 处理过 token 预算的消息历史
  jobContext?: string;            // 格式化的 job 状态文本块（注入 system prompt）
  longTermContext?: string;       // 格式化的长期记忆文本块
}

/**
 * 执行轨迹条目
 */
export interface TraceEntry {
  step: number;
  timestamp: string;
  type: 'tool_call' | 'tool_result' | 'message';
  data: Record<string, unknown>;
}

/**
 * 工具注册表接口
 */
export interface ToolRegistry {
  register(tool: ToolDef): void;
  getTool(name: string): ToolDef | undefined;
  execute(toolCall: ToolCall, ctx: ToolContext): Promise<ToolResult>;
}

/**
 * Skill 注册表接口
 */
export interface SkillRegistry {
  register(skill: SkillDef): void;
  resolve(skillIds: string[]): { tools: ToolDef[]; skillDocs: string[] };
}

/**
 * Skill 定义
 */
export interface SkillDef {
  id: string;
  name: string;
  description: string;
  skillMdPath?: string;           // SKILL.md 文件路径
  tools: ToolDef[];
}

/**
 * Job 管理器接口
 */
export interface JobManager {
  create(params: CreateJobParams): Promise<Job>;
  get(jobId: string): Promise<Job>;
  update(jobId: string, patch: Partial<JobState>): Promise<void>;
  appendTrace(jobId: string, entry: TraceEntry): Promise<void>;
  createSnapshot(jobId: string, trigger: SnapshotTrigger): Promise<Snapshot>;
  revertToSnapshot(jobId: string, snapId: string): Promise<void>;
  list(): Promise<JobSummary[]>;
}

/**
 * 创建 Job 参数
 */
export interface CreateJobParams {
  name?: string;
  sessionId: string;
}

/**
 * Job 定义
 */
export interface Job {
  id: string;
  sessionId: string;
  name?: string;
  status: JobStatus;
  summary?: string;
  createdAt: string;
  updatedAt: string;
  intent?: IntentInfo;
  traces: TraceEntry[];
  state: JobState;
}

/**
 * Job 状态
 */
export type JobStatus = 'created' | 'running' | 'paused' | 'completed' | 'failed';

/**
 * Job 运行时状态
 */
export interface JobState {
  activeDatasetId?: string;
  datasets: DatasetInfo[];
  messages: Message[];
  requirementDocument?: RequirementDocument;
}

/**
 * 数据集信息
 */
export interface DatasetInfo {
  id: string;
  name: string;
  path: string;
  format: string;
  metadata?: DatasetMetadata;
}

/**
 * 需求文档
 */
export interface RequirementDocument {
  title: string;
  status: 'draft' | 'discussing' | 'confirmed' | 'executing' | 'completed';
  datasets: DataSourceInfo[];
  processingGoal?: string;
  outputRequirements?: {
    format?: string;
    filename?: string;
    columns?: string[];
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * 数据源信息
 */
export interface DataSourceInfo {
  file: string;
  description?: string;
  rows?: number;
  keyFields?: string[];
}

/**
 * 快照
 */
export interface Snapshot {
  id: string;
  jobId: string;
  trigger: SnapshotTrigger;
  createdAt: string;
  state: JobState;
  files: SnapshotFile[];
}

/**
 * 快照触发器
 */
export type SnapshotTrigger =
  | 'requirement.saved'
  | 'analysis.before_execute'
  | 'analysis.after_execute'
  | 'file.uploaded'
  | 'manual';

/**
 * 快照文件
 */
export interface SnapshotFile {
  path: string;
  content: string;
}

/**
 * Job 摘要
 */
export interface JobSummary {
  id: string;
  name?: string;
  status: JobStatus;
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * LLM 客户端接口
 */
export interface LLMClient {
  isAvailable(): boolean;
  stream(params: LLMParams): AsyncGenerator<LLMStreamChunk>;
  call(params: LLMParams): Promise<LLMResponse>;
  chatWithTools(messages: Message[], tools: ToolDef[]): Promise<LLMResponse>;
}

/**
 * LLM 参数
 */
export interface LLMParams {
  messages: Message[];
  tools?: ToolDef[];
  model?: string;         // 不指定则使用环境变量默认值
  maxTokens?: number;
}

/**
 * LLM 流式响应块
 */
export interface LLMStreamChunk {
  delta: string;
  done: boolean;
}

/**
 * LLM 响应
 */
export interface LLMResponse {
  content: string;
  toolCalls: ToolCall[];
}

/**
 * EventBus 接口
 */
export interface EventBus {
  publish<T>(event: AgentEvent<T>): void;
  subscribe<T>(type: string, handler: (event: AgentEvent<T>) => void): () => void;
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 创建 Agent 事件
 */
export function createAgentEvent<T = unknown>(
  type: AgentEventType,
  data?: T,
  jobId?: string,
  sessionId?: string
): AgentEvent<T> {
  return {
    type,
    timestamp: new Date().toISOString(),
    jobId,
    sessionId,
    data,
  };
}

/**
 * 创建空的 Agent 上下文
 */
export function createAgentContext(
  jobId: string,
  sessionId: string
): AgentContext {
  return {
    jobId,
    sessionId,
    messages: [],
    datasets: new Map(),
    activeDatasetId: undefined,
    systemPromptSuffix: undefined,
    currentIntent: undefined,
  };
}

/**
 * 创建默认记忆策略
 */
export function createDefaultMemoryPolicy(): MemoryPolicy {
  return {
    workingMemory: {
      maxMessages: 50,
      maxTokens: 40000,
    },
    jobMemory: {
      includeDatasetMeta: true,
      includeRequirementDoc: true,
      includeRecentTraces: 5,
    },
    longTermMemory: {
      enabled: false,
    },
  };
}
