/**
 * Job Manager - 任务管理器
 *
 * 职责：
 * - 创建/加载/更新 Job
 * - 管理目录结构
 * - 记录执行轨迹
 * - 任务恢复
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import type { ConversationContext, Dataset } from '../agents/types.js';
import type { JobMeta, JobStatus, JobWorkspace, TraceEntry } from './types.js';
import { createJobMeta, generateJobId } from './types.js';

const JOBS_DIR = 'jobs';
const UPLOADS_DIR = 'uploads';

/**
 * 获取 jobs 目录路径
 */
function getJobsDir(): string {
  return path.join(config.data.dir, JOBS_DIR);
}

/**
 * 获取 uploads 目录路径
 */
function getUploadsDir(): string {
  return path.join(config.data.dir, UPLOADS_DIR);
}

/**
 * 获取 Job 工作空间路径
 */
function getJobDir(jobId: string): string {
  return path.join(getJobsDir(), jobId);
}

/**
 * 创建 Job 工作空间
 */
export async function createJobWorkspace(
  sessionId: string,
  intent?: ConversationContext['currentIntent']
): Promise<JobWorkspace> {
  const jobMeta = createJobMeta(sessionId, intent);
  const jobDir = getJobDir(jobMeta.id);

  // 创建目录结构
  await fs.mkdir(path.join(jobDir, 'inputs'), { recursive: true });
  await fs.mkdir(path.join(jobDir, 'outputs'), { recursive: true });
  await fs.mkdir(path.join(jobDir, 'checkpoints'), { recursive: true });

  // 写入元数据
  await fs.writeFile(
    path.join(jobDir, 'job.json'),
    JSON.stringify(jobMeta, null, 2)
  );

  // 创建空的轨迹文件
  await fs.writeFile(path.join(jobDir, 'trace.jsonl'), '');

  return {
    id: jobMeta.id,
    dir: jobDir,
    metaPath: path.join(jobDir, 'job.json'),
    tracePath: path.join(jobDir, 'trace.jsonl'),
    inputsDir: path.join(jobDir, 'inputs'),
    outputsDir: path.join(jobDir, 'outputs'),
    checkpointsDir: path.join(jobDir, 'checkpoints'),
  };
}

/**
 * 加载 Job 元数据
 */
export async function loadJobMeta(jobId: string): Promise<JobMeta | null> {
  const metaPath = path.join(getJobDir(jobId), 'job.json');
  try {
    const content = await fs.readFile(metaPath, 'utf-8');
    return JSON.parse(content) as JobMeta;
  } catch {
    return null;
  }
}

/**
 * 更新 Job 元数据
 */
export async function updateJobMeta(
  jobId: string,
  updates: Partial<JobMeta>
): Promise<JobMeta | null> {
  const meta = await loadJobMeta(jobId);
  if (!meta) {
    return null;
  }

  const updated: JobMeta = {
    ...meta,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(
    path.join(getJobDir(jobId), 'job.json'),
    JSON.stringify(updated, null, 2)
  );

  return updated;
}

/**
 * 追加执行轨迹
 */
export async function appendTrace(
  jobId: string,
  entry: Omit<TraceEntry, 'timestamp'>
): Promise<void> {
  const tracePath = path.join(getJobDir(jobId), 'trace.jsonl');
  const fullEntry: TraceEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  await fs.appendFile(tracePath, JSON.stringify(fullEntry) + '\n');
}

/**
 * 读取执行轨迹
 */
export async function readTraces(jobId: string): Promise<TraceEntry[]> {
  const tracePath = path.join(getJobDir(jobId), 'trace.jsonl');
  try {
    const content = await fs.readFile(tracePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.map((line) => JSON.parse(line) as TraceEntry);
  } catch {
    return [];
  }
}

/**
 * 列出所有 Job
 */
export async function listJobs(): Promise<JobMeta[]> {
  const jobsDir = getJobsDir();
  try {
    const entries = await fs.readdir(jobsDir, { withFileTypes: true });
    const jobDirs = entries.filter((e) => e.isDirectory() && e.name.startsWith('job_'));

    const jobs: JobMeta[] = [];
    for (const dir of jobDirs) {
      const meta = await loadJobMeta(dir.name);
      if (meta) {
        jobs.push(meta);
      }
    }

    // 按创建时间倒序排列
    return jobs.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
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
export async function resumeJob(jobId: string): Promise<ConversationContext | null> {
  const meta = await loadJobMeta(jobId);
  if (!meta) {
    return null;
  }

  const traces = await readTraces(jobId);

  // 重建上下文
  const context: ConversationContext = {
    sessionId: meta.sessionId,
    messages: [],
    datasets: new Map(),
    currentIntent: meta.intent,
  };

  // 重放轨迹，恢复数据集
  for (const trace of traces) {
    if (trace.type === 'tool_result' && trace.data.dataset) {
      const dataset = trace.data.dataset as Dataset;
      context.datasets.set(dataset.id, dataset);
      context.activeDatasetId = dataset.id;
    }
  }

  return context;
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
 * 移动上传文件到 Job inputs
 */
export async function moveToInputs(
  jobId: string,
  sourcePath: string,
  filename?: string
): Promise<string> {
  const destFilename = filename || path.basename(sourcePath);
  const destPath = path.join(getJobDir(jobId), 'inputs', destFilename);
  await fs.rename(sourcePath, destPath);
  return destPath;
}

/**
 * 确保 jobs 和 uploads 目录存在
 */
export async function ensureJobDirs(): Promise<void> {
  await fs.mkdir(getJobsDir(), { recursive: true });
  await fs.mkdir(getUploadsDir(), { recursive: true });
}

/**
 * 获取 Job 工作空间信息
 */
export function getJobWorkspace(jobId: string): JobWorkspace {
  const jobDir = getJobDir(jobId);
  return {
    id: jobId,
    dir: jobDir,
    metaPath: path.join(jobDir, 'job.json'),
    tracePath: path.join(jobDir, 'trace.jsonl'),
    inputsDir: path.join(jobDir, 'inputs'),
    outputsDir: path.join(jobDir, 'outputs'),
    checkpointsDir: path.join(jobDir, 'checkpoints'),
  };
}