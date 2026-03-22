import { Hono } from 'hono';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  listJobs,
  getJob,
  deleteJob,
  resumeJob,
} from '../job/index.js';

const jobRouter = new Hono();

/**
 * 列出所有 Job
 */
jobRouter.get('/jobs', async (c) => {
  try {
    const jobs = await listJobs();
    return c.json({ ok: true, jobs });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 获取 Job 详情
 */
jobRouter.get('/jobs/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId');
    const job = await getJob(jobId);

    if (!job) {
      return c.json({ ok: false, error: 'Job not found' }, 404);
    }

    return c.json({
      ok: true,
      job: {
        id: job.id,
        sessionId: job.sessionId,
        status: job.status,
        summary: job.summary,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        intent: job.intent,
        traces: job.traces,
        state: job.state,
        inputsDir: `data/${jobId}/inputs`,
        outputsDir: `data/${jobId}/outputs`,
      },
    });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 恢复 Job
 */
jobRouter.post('/session/resume', async (c) => {
  try {
    const body = await c.req.json();
    const jobId = body.jobId;

    if (!jobId || typeof jobId !== 'string') {
      return c.json({ ok: false, error: 'jobId is required' }, 400);
    }

    const context = await resumeJob(jobId);
    if (!context) {
      return c.json({ ok: false, error: 'Job not found or cannot be resumed' }, 404);
    }

    return c.json({
      ok: true,
      sessionId: context.sessionId,
      jobId,
      context: {
        sessionId: context.sessionId,
        activeDatasetId: context.activeDatasetId,
        currentIntent: context.currentIntent,
        datasets: Array.from(context.datasets.values()),
        messages: context.messages,
      },
    });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 删除 Job
 */
jobRouter.delete('/jobs/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId');
    const success = await deleteJob(jobId);

    if (!success) {
      return c.json({ ok: false, error: 'Failed to delete job' }, 500);
    }

    return c.json({ ok: true, jobId });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

export default jobRouter;