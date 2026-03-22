/**
 * Job 类型定义
 *
 * Job 是任务的持久化单元，包含：
 * - 元数据（job.json）
 * - 执行轨迹（trace.jsonl）
 * - 输入资产（inputs/）
 * - 输出资产（outputs/）
 * - 检查点（checkpoints/）
 */

import type { Intent } from '../agents/types.js';

export type JobStatus =
  | 'created'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

/**
 * Job 元数据
 */
export interface JobMeta {
  /** Job ID，格式：job_YYYYMMDD_HHMM_随机串 */
  id: string;
  /** 关联的会话 ID */
  sessionId: string;
  /** 任务状态 */
  status: JobStatus;
  /** 初始意图 */
  intent?: Intent;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 任务摘要（用于历史列表展示） */
  summary?: string;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 执行轨迹条目
 */
export interface TraceEntry {
  /** 时间戳 */
  timestamp: string;
  /** 步骤编号 */
  step: number;
  /** 条目类型 */
  type: 'intent' | 'tool_call' | 'tool_result' | 'llm_call' | 'checkpoint' | 'error';
  /** 数据 */
  data: Record<string, unknown>;
}

/**
 * Job 目录结构
 */
export interface JobWorkspace {
  /** Job ID */
  id: string;
  /** Job 目录路径 */
  dir: string;
  /** 元数据文件路径 */
  metaPath: string;
  /** 轨迹文件路径 */
  tracePath: string;
  /** 输入目录 */
  inputsDir: string;
  /** 输出目录 */
  outputsDir: string;
  /** 检查点目录 */
  checkpointsDir: string;
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
 * 创建初始 Job 元数据
 */
export function createJobMeta(sessionId: string, intent?: Intent): JobMeta {
  const now = new Date().toISOString();
  return {
    id: generateJobId(),
    sessionId,
    status: 'created',
    intent,
    createdAt: now,
    updatedAt: now,
  };
}