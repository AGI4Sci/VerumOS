/**
 * Job Manager - 任务管理器（简化版）
 *
 * 只保留核心函数：
 * - createJob: 创建 Job
 * - getJob: 读取 Job
 * - updateJob: 更新 Job
 * - listJobs: 列出所有 Job
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import type { Intent, Dataset, Message } from '../agents/types.js';
import type { Job, TraceEntry } from './types.js';
import { createJob as createJobObject, generateJobId } from './types.js';

/**
 * 获取 Job 目录路径
 */
function getJobDir(jobId: string): string {
  return path.join(config.data.dir, jobId);
}

/**
 * 创建 Job（首次上传时调用）
 */
export async function createJob(sessionId: string, intent?: Intent): Promise<string> {
  const jobId = generateJobId();
  const jobDir = getJobDir(jobId);
  const inputsDir = path.join(jobDir, 'inputs');
  const outputsDir = path.join(jobDir, 'outputs');

  // 创建目录结构
  await fs.mkdir(inputsDir, { recursive: true });
  await fs.mkdir(outputsDir, { recursive: true });

  // 创建 Job 对象
  const job = createJobObject(sessionId, intent);

  // 写入 job.json
  await fs.writeFile(
    path.join(jobDir, 'job.json'),
    JSON.stringify(job, null, 2)
  );

  return jobId;
}

/**
 * 读取 Job
 */
export async function getJob(jobId: string): Promise<Job | null> {
  const jobPath = path.join(getJobDir(jobId), 'job.json');
  try {
    const content = await fs.readFile(jobPath, 'utf-8');
    return JSON.parse(content) as Job;
  } catch {
    return null;
  }
}

/**
 * 更新 Job（追加轨迹、更新状态）
 */
export async function updateJob(jobId: string, updates: Partial<Job>): Promise<void> {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const updated: Job = {
    ...job,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(
    path.join(getJobDir(jobId), 'job.json'),
    JSON.stringify(updated, null, 2)
  );
}

/**
 * 追加执行轨迹
 */
export async function appendTrace(
  jobId: string,
  entry: Omit<TraceEntry, 'step' | 'timestamp'>
): Promise<void> {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const step = job.traces.length + 1;
  const fullEntry: TraceEntry = {
    ...entry,
    step,
    timestamp: new Date().toISOString(),
  };

  await updateJob(jobId, {
    traces: [...job.traces, fullEntry],
  });
}

/**
 * 列出所有 Job
 */
export async function listJobs(): Promise<Job[]> {
  try {
    const entries = await fs.readdir(config.data.dir, { withFileTypes: true });
    const jobDirs = entries.filter((e) => e.isDirectory() && e.name.startsWith('job_'));

    const jobs: Job[] = [];
    for (const dir of jobDirs) {
      const job = await getJob(dir.name);
      if (job) {
        jobs.push(job);
      }
    }

    // 按创建时间倒序排列
    return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/**
 * 删除 Job
 */
export async function deleteJob(jobId: string): Promise<boolean> {
  const jobDir = getJobDir(jobId);
  try {
    await fs.rm(jobDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * 恢复 Job 上下文
 */
export async function resumeJob(jobId: string): Promise<{
  sessionId: string;
  messages: Message[];
  datasets: Map<string, Dataset>;
  activeDatasetId?: string;
  currentIntent?: Intent;
} | null> {
  const job = await getJob(jobId);
  if (!job) {
    return null;
  }

  // 从 state 恢复
  const datasets = new Map<string, Dataset>();
  for (const dataset of job.state.datasets) {
    datasets.set(dataset.id, dataset);
  }

  return {
    sessionId: job.sessionId,
    messages: job.state.messages,
    datasets,
    activeDatasetId: job.state.activeDatasetId,
    currentIntent: job.intent,
  };
}

/**
 * 保存文件到 inputs
 */
export async function saveToInputs(
  jobId: string,
  filename: string,
  content: Buffer
): Promise<string> {
  const inputsDir = path.join(getJobDir(jobId), 'inputs');

  // 确保目录存在
  await fs.mkdir(inputsDir, { recursive: true });

  const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const savedPath = path.join(inputsDir, safeName);
  await fs.writeFile(savedPath, content);
  return savedPath;
}

/**
 * 保存输出文件
 */
export async function saveOutput(
  jobId: string,
  filename: string,
  content: string | Buffer
): Promise<string> {
  const outputPath = path.join(getJobDir(jobId), 'outputs', filename);
  await fs.writeFile(outputPath, content);
  return outputPath;
}

/**
 * 根据 sessionId 查找 Job
 */
export async function findJobBySessionId(sessionId: string): Promise<Job | null> {
  const jobs = await listJobs();
  return jobs.find((j) => j.sessionId === sessionId) || null;
}

/**
 * 确保 data 目录存在
 */
export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(config.data.dir, { recursive: true });
}