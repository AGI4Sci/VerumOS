import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { agentRegistry } from '../agents/index.js';
import type { Message, Dataset } from '../agents/types.js';
import {
  createJob,
  getJob,
  updateJob,
  appendTrace,
  listJobs,
} from '../job/index.js';
import type { Job } from '../job/types.js';
import { emitSessionEvent } from '../ws/server.js';
import { createSnapshot } from '../job/snapshot-manager.js';

const chatRouter = new Hono();

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

/**
 * 获取或创建 Job（基于 sessionId）
 */
async function getOrCreateJobForSession(sessionId?: string): Promise<{ jobId: string; job: Job }> {
  if (sessionId) {
    const jobs = await listJobs();
    const existingJob = jobs.find((j) => j.sessionId === sessionId);
    if (existingJob) {
      return { jobId: existingJob.id, job: existingJob };
    }
  }

  const newSessionId = sessionId || uuidv4();
  const jobId = await createJob(newSessionId);
  const job = await getJob(jobId);
  if (!job) {
    throw new Error('Failed to create job');
  }
  return { jobId, job };
}

chatRouter.post('/session', async (c) => {
  const sessionId = uuidv4();
  const jobId = await createJob(sessionId);
  const job = await getJob(jobId);

  return c.json({
    ok: true,
    sessionId,
    jobId,
    context: job ? serializeContextForResponse(jobToContext(job)) : null,
  });
});

chatRouter.get('/session/:id', async (c) => {
  const sessionId = c.req.param('id');
  const jobs = await listJobs();
  const job = jobs.find((j) => j.sessionId === sessionId);

  if (!job) {
    return c.json({ ok: false, error: 'Session not found' }, 404);
  }
  return c.json({ ok: true, context: serializeContextForResponse(jobToContext(job)) });
});

chatRouter.get('/history/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const jobs = await listJobs();
  const job = jobs.find((j) => j.sessionId === sessionId);

  if (!job) {
    return c.json({ ok: false, error: 'Session not found' }, 404);
  }
  return c.json({ ok: true, messages: job.state.messages });
});

chatRouter.post('/chat', async (c) => {
  try {
    const body = await c.req.json();
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
      return c.json({ ok: false, error: 'Message is required' }, 400);
    }

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined;
    const requestedAgentId = typeof body.agentId === 'string' ? body.agentId : undefined;
    const { jobId, job } = await getOrCreateJobForSession(sessionId);
    const context = jobToContext(job);

    // 判断是否是执行需求的意图
    const isExecuteIntent = message.includes('执行需求文档中的分析方案') ||
                             message.includes('执行分析方案') ||
                             message.includes('开始执行');

    // 执行需求前创建快照
    if (isExecuteIntent) {
      try {
        await createSnapshot(jobId, 'pre_execute');
      } catch (error) {
        console.error('Failed to create pre-execute snapshot:', error);
      }
    }

    const userMessage: Message = {
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };

    // 根据请求的 agentId 获取 Agent，否则使用默认
    const agent = requestedAgentId
      ? agentRegistry.get(requestedAgentId) || agentRegistry.getDefault()
      : agentRegistry.getDefault();
    const response = await agent.processMessage(message, context);

    const assistantMessage: Message = {
      role: 'assistant',
      content: response.content,
      timestamp: Date.now(),
    };

    // 记录用户消息轨迹
    await appendTrace(jobId, {
      type: 'tool_call',
      data: { role: 'user', message },
    });

    // 记录助手响应轨迹
    await appendTrace(jobId, {
      type: 'tool_result',
      data: { 
        role: 'assistant', 
        responseType: response.type,
        content: response.content?.slice(0, 500),
        results: (response.result as { results?: unknown })?.results,
      },
    });

    // 更新 Job 状态
    await updateJob(jobId, {
      status: 'running',
      state: {
        activeDatasetId: context.activeDatasetId,
        datasets: Array.from(context.datasets.values()),
        messages: [...job.state.messages, userMessage, assistantMessage],
      },
    });

    // 执行需求后创建快照
    if (isExecuteIntent) {
      try {
        await createSnapshot(jobId, 'post_execute');
      } catch (error) {
        console.error('Failed to create post-execute snapshot:', error);
      }
    }

    emitSessionEvent(context.sessionId, {
      type: 'chat.completed',
      payload: {
        agentId: agent.id,
        response,
      },
    });

    return c.json({
      ok: true,
      sessionId: context.sessionId,
      jobId,
      agentId: agent.id,
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

export default chatRouter;