import { Hono } from 'hono';
import {
  listJobs,
  loadJobMeta,
  readTraces,
  deleteJob,
  resumeJob,
  getJobWorkspace,
} from '../job/index.js';
import { getOrCreateSession, updateSession } from '../session-store.js';

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
    const meta = await loadJobMeta(jobId);

    if (!meta) {
      return c.json({ ok: false, error: 'Job not found' }, 404);
    }

    const traces = await readTraces(jobId);
    const workspace = getJobWorkspace(jobId);

    return c.json({
      ok: true,
      job: {
        meta,
        traces,
        workspace: {
          dir: workspace.dir,
          inputsDir: workspace.inputsDir,
          outputsDir: workspace.outputsDir,
        },
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

    // 确保会话存在
    await getOrCreateSession(context.sessionId);
    await updateSession(context);

    return c.json({
      ok: true,
      sessionId: context.sessionId,
      jobId,
      context: {
        sessionId: context.sessionId,
        activeDatasetId: context.activeDatasetId,
        currentIntent: context.currentIntent,
        datasets: Array.from(context.datasets.values()),
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