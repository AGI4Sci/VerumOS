/**
 * Job 类型定义（简化版）
 *
 * 一个 Job 对应一个任务，包含：
 * - 元数据（id, sessionId, status, summary）
 * - 执行轨迹（traces 数组）
 * - 运行时状态（state）
 */

import type { Intent, Dataset, Message } from '../agents/types.js';

export type JobStatus =
  | 'created'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

/**
 * 执行轨迹条目
 */
export interface TraceEntry {
  /** 步骤编号 */
  step: number;
  /** 时间戳 */
  timestamp: string;
  /** 条目类型 */
  type: 'tool_call' | 'tool_result' | 'llm_call' | 'error';
  /** 数据 */
  data: Record<string, unknown>;
}

/**
 * Job 运行时状态
 */
export interface JobState {
  activeDatasetId?: string;
  datasets: Dataset[];
  messages: Message[];
}

/**
 * Job 完整定义
 *
 * 一个文件包含所有信息：元数据、执行轨迹、运行时状态。
 */
export interface Job {
  /** Job ID，格式：job_YYYYMMDD_HHMM_随机串 */
  id: string;
  /** 关联的会话 ID */
  sessionId: string;
  /** 任务状态 */
  status: JobStatus;
  /** 任务摘要（用于历史列表展示） */
  summary?: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 初始意图 */
  intent?: Intent;
  /** 执行轨迹 */
  traces: TraceEntry[];
  /** 运行时状态 */
  state: JobState;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 创建 Job ID
 */
export function generateJobId(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 5).replace(/:/g, '');
  const randomStr = Math.random().toString(36).slice(2, 8);
  return `job_${dateStr}_${timeStr}_${randomStr}`;
}

/**
 * 创建初始 Job
 */
export function createJob(sessionId: string, intent?: Intent): Job {
  const now = new Date().toISOString();
  return {
    id: generateJobId(),
    sessionId,
    status: 'created',
    createdAt: now,
    updatedAt: now,
    intent,
    traces: [],
    state: { datasets: [], messages: [] },
  };
}