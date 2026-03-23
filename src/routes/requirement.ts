import { Hono } from 'hono';
import {
  getRequirementDocument,
  saveRequirementDocument,
  createRequirementDocument,
  updateRequirementDocument,
  parseMarkdownToDocument,
  documentToMarkdown,
  generateToolChain,
} from '../agents/requirement-doc.js';
import { createSnapshot } from '../job/snapshot-manager.js';

const requirementRouter = new Hono();

// 获取需求文档
requirementRouter.get('/requirement/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const doc = await getRequirementDocument(sessionId);

  if (!doc) {
    // 尝试从 data 目录读取初始需求文档
    return c.json({
      ok: true,
      document: null,
      message: 'No requirement document found for this session',
    });
  }

  return c.json({
    ok: true,
    document: doc,
    markdown: documentToMarkdown(doc),
    toolChain: await generateToolChain(doc),
  });
});

// 创建或更新需求文档
requirementRouter.post('/requirement/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const body = await c.req.json();

  let doc = await getRequirementDocument(sessionId);

  if (!doc) {
    doc = await createRequirementDocument(sessionId, body.title, body.jobId);
  }

  // 更新 jobId 关联
  if (body.jobId) doc.jobId = body.jobId;

  // 支持直接传入 markdown 内容
  if (typeof body.markdown === 'string') {
    const parsed = parseMarkdownToDocument(body.markdown);
    Object.assign(doc, parsed);
  }

  // 支持传入结构化更新
  if (body.title) doc.title = body.title;
  if (body.status) doc.status = body.status;
  if (Array.isArray(body.datasets)) doc.datasets = body.datasets;
  if (Array.isArray(body.goals)) doc.goals = body.goals;
  if (Array.isArray(body.analysisPlan)) doc.analysisPlan = body.analysisPlan;
  if (body.content) doc.content = body.content;

  const savedPath = await saveRequirementDocument(doc);

  // 创建快照
  if (doc.jobId) {
    try {
      await createSnapshot(doc.jobId, 'requirement_saved');
    } catch (error) {
      console.error('Failed to create snapshot:', error);
    }
  }

  return c.json({
    ok: true,
    document: doc,
    markdown: documentToMarkdown(doc),
    toolChain: await generateToolChain(doc),
    savedToJob: savedPath ? true : false,
  });
});

// 更新需求文档状态
requirementRouter.patch('/requirement/:sessionId/status', async (c) => {
  const sessionId = c.req.param('sessionId');
  const body = await c.req.json();

  const updated = await updateRequirementDocument(sessionId, {
    status: body.status,
  });

  if (!updated) {
    return c.json({ ok: false, error: 'Document not found' }, 404);
  }

  return c.json({
    ok: true,
    document: updated,
    markdown: documentToMarkdown(updated),
  });
});

// 获取工具链
requirementRouter.get('/requirement/:sessionId/toolchain', async (c) => {
  const sessionId = c.req.param('sessionId');
  const doc = await getRequirementDocument(sessionId);

  if (!doc) {
    return c.json({ ok: false, error: 'Document not found' }, 404);
  }

  return c.json({
    ok: true,
    toolChain: await generateToolChain(doc),
  });
});

export default requirementRouter;