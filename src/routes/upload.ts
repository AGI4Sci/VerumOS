import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { dataAgentProcessor } from '../agents/data-agent.js';
import type { Message, Dataset } from '../agents/types.js';
import { config } from '../config.js';
import {
  createJob,
  getJob,
  updateJob,
  appendTrace,
  listJobs,
  ensureDataDir,
  saveToInputs,
} from '../job/index.js';
import type { Job } from '../job/types.js';
import { emitSessionEvent } from '../ws/server.js';
import { getCoreServices } from '../app.js';
import { createAgentEvent } from '../core/types.js';

const uploadRouter = new Hono();

/**
 * 获取或创建 Job（基于 sessionId）
 */
async function getOrCreateJob(sessionId?: string): Promise<{ jobId: string; job: Job; isNew: boolean }> {
  if (sessionId) {
    // 尝试找到关联的 job
    const jobs = await listJobs();
    const existingJob = jobs.find((j) => j.sessionId === sessionId);
    if (existingJob) {
      return { jobId: existingJob.id, job: existingJob, isNew: false };
    }
  }

  // 创建新 Job
  const newSessionId = sessionId || uuidv4();
  const jobId = await createJob(newSessionId);
  const job = await getJob(jobId);
  if (!job) {
    throw new Error('Failed to create job');
  }
  return { jobId, job, isNew: true };
}

/**
 * 从 Job 恢复上下文
 */
function jobToContext(job: Job) {
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
 * 序列化上下文（用于 API 响应）
 */
function serializeContextForResponse(context: ReturnType<typeof jobToContext>) {
  return {
    sessionId: context.sessionId,
    activeDatasetId: context.activeDatasetId,
    currentIntent: context.currentIntent,
    messages: context.messages,
    datasets: Array.from(context.datasets.values()),
  };
}

uploadRouter.post('/upload', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined;

    if (!(file instanceof File)) {
      return c.json({ ok: false, error: 'No file uploaded' }, 400);
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!['.csv', '.tsv', '.xlsx', '.xls'].includes(ext)) {
      return c.json({ ok: false, error: `Unsupported file type: ${ext}` }, 400);
    }

    // 1. 创建或获取 Job
    const { jobId, job, isNew } = await getOrCreateJob(sessionId);

    // 2. 保存文件到 inputs/
    const savedPath = await saveToInputs(jobId, file.name, Buffer.from(await file.arrayBuffer()));

    // 3. 记录轨迹
    await appendTrace(jobId, {
      type: 'tool_call',
      data: { tool: 'upload', params: { filename: file.name, size: file.size } },
    });

    // 4. 恢复上下文并调用 Agent 处理
    const context = jobToContext(job);
    const uploadMessage: Message = {
      role: 'user',
      content: `上传文件：${file.name}`,
      timestamp: Date.now(),
    };

    const response = await dataAgentProcessor.ingestFile(savedPath, context, file.name);
    const assistantMessage: Message = {
      role: 'assistant',
      content: response.content,
      timestamp: Date.now(),
    };

    // 5. 更新 Job 状态
    const updatedJob = await getJob(jobId);
    if (updatedJob) {
      await updateJob(jobId, {
        status: 'running',
        state: {
          activeDatasetId: context.activeDatasetId,
          datasets: Array.from(context.datasets.values()),
          messages: [...updatedJob.state.messages, uploadMessage, assistantMessage],
        },
      });
    }

    // 6. 记录结果
    await appendTrace(jobId, {
      type: 'tool_result',
      data: { dataset: (response.result as { dataset?: unknown })?.dataset },
    });

    // 7. 发布文件上传事件到 EventBus（渐进式）
    const coreServices = getCoreServices();
    if (coreServices) {
      coreServices.eventBus.publish(
        createAgentEvent('file.uploaded', 
          { filename: file.name, path: savedPath, size: file.size }, 
          jobId, 
          context.sessionId
        )
      );
    }

    emitSessionEvent(context.sessionId, {
      type: 'dataset.registered',
      payload: {
        fileName: file.name,
        savedPath,
        jobId,
        response,
      },
    });

    return c.json({
      ok: true,
      jobId,
      sessionId: context.sessionId,
      file: {
        name: file.name,
        path: savedPath,
        size: file.size,
        type: ext,
      },
      response,
      context: serializeContextForResponse(context),
    });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

uploadRouter.get('/files', async (c) => {
  try {
    await ensureDataDir();
    const jobs = await listJobs();

    // 收集所有 job 的 inputs 文件
    const files: Array<{
      name: string;
      path: string;
      size: number;
      modifiedAt: string;
      jobId: string;
    }> = [];

    for (const job of jobs) {
      const inputsDir = path.join(config.data.dir, job.id, 'inputs');
      try {
        const entries = await fs.readdir(inputsDir, { withFileTypes: true });
        for (const entry of entries.filter((e) => e.isFile())) {
          const filePath = path.join(inputsDir, entry.name);
          const stat = await fs.stat(filePath);
          files.push({
            name: entry.name,
            path: filePath,
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            jobId: job.id,
          });
        }
      } catch {
        // 目录不存在，跳过
      }
    }

    // 按修改时间倒序排列
    files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

    return c.json({ ok: true, files });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

export default uploadRouter;
