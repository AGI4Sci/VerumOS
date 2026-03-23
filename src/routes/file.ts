import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { config } from '../config.js';
import { createSnapshot } from '../job/snapshot-manager.js';

const fileRouter = new Hono();

/**
 * 安全检查：防止路径遍历攻击
 */
function isPathSafe(jobId: string, targetPath: string): boolean {
  const jobRoot = path.join(config.data.dir, jobId);
  const normalized = path.normalize(targetPath);
  return normalized.startsWith(jobRoot);
}

/**
 * 获取目录树结构
 * GET /api/files/tree?jobId=xxx&path=inputs
 */
fileRouter.get('/files/tree', async (c) => {
  try {
    const jobId = c.req.query('jobId');
    const subPath = c.req.query('path') || '';

    if (!jobId) {
      return c.json({ ok: false, error: 'jobId is required' }, 400);
    }

    const targetPath = path.join(config.data.dir, jobId, subPath);

    // 安全检查：防止路径遍历攻击
    if (!isPathSafe(jobId, targetPath)) {
      return c.json({ ok: false, error: 'Invalid path' }, 400);
    }

    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) {
      return c.json({ ok: false, error: 'Not a directory' }, 400);
    }

    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    const tree = await Promise.all(entries.map(async (entry) => {
      const entryPath = subPath ? `${subPath}/${entry.name}` : entry.name;
      const fullPath = path.join(targetPath, entry.name);
      const stat = await fs.stat(fullPath);

      return {
        name: entry.name,
        path: entryPath,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    }));

    return c.json({ ok: true, path: subPath, entries: tree });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 读取文件内容
 * GET /api/files/content?jobId=xxx&path=inputs/count_matrix.csv
 * GET /api/files/content?jobId=xxx&path=inputs/count_matrix.csv&download=1
 */
fileRouter.get('/files/content', async (c) => {
  try {
    const jobId = c.req.query('jobId');
    const filePath = c.req.query('path');
    const download = c.req.query('download') === '1';

    if (!jobId || !filePath) {
      return c.json({ ok: false, error: 'jobId and path are required' }, 400);
    }

    const fullPath = path.join(config.data.dir, jobId, filePath);

    // 安全检查
    if (!isPathSafe(jobId, fullPath)) {
      return c.json({ ok: false, error: 'Invalid path' }, 400);
    }

    const stats = await fs.stat(fullPath);

    // 下载模式：直接返回文件流
    if (download) {
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      
      // MIME 类型映射
      const mimeTypes: Record<string, string> = {
        '.csv': 'text/csv',
        '.tsv': 'text/tab-separated-values',
        '.json': 'application/json',
        '.md': 'text/markdown',
        '.txt': 'text/plain',
        '.log': 'text/plain',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
      };
      
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      
      return new Response(await fs.readFile(fullPath), {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
          'Content-Length': stats.size.toString(),
        },
      });
    }

    // 预览模式：返回 JSON（带大小限制）
    // 大文件限制（5MB）
    if (stats.size > 5 * 1024 * 1024) {
      return c.json({
        ok: false,
        error: 'File too large (max 5MB)',
        size: stats.size,
      }, 400);
    }

    const content = await fs.readFile(fullPath, 'utf-8');

    // 检测文件类型
    const ext = path.extname(filePath).toLowerCase();
    const type = ['.csv', '.tsv', '.json', '.md', '.txt', '.log'].includes(ext)
      ? 'text'
      : 'binary';

    return c.json({
      ok: true,
      path: filePath,
      type,
      content: type === 'text' ? content : null,
      size: stats.size,
    });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 创建文件夹
 * POST /api/files/mkdir
 */
fileRouter.post('/files/mkdir', async (c) => {
  try {
    const body = await c.req.json();
    const { jobId, path: dirPath } = body;

    if (!jobId || !dirPath) {
      return c.json({ ok: false, error: 'jobId and path are required' }, 400);
    }

    const fullPath = path.join(config.data.dir, jobId, dirPath);

    if (!isPathSafe(jobId, fullPath)) {
      return c.json({ ok: false, error: 'Invalid path' }, 400);
    }

    await fs.mkdir(fullPath, { recursive: true });

    return c.json({ ok: true, path: dirPath });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 创建空文件
 * POST /api/files/create
 */
fileRouter.post('/files/create', async (c) => {
  try {
    const body = await c.req.json();
    const { jobId, path: filePath, content = '' } = body;

    if (!jobId || !filePath) {
      return c.json({ ok: false, error: 'jobId and path are required' }, 400);
    }

    const fullPath = path.join(config.data.dir, jobId, filePath);

    if (!isPathSafe(jobId, fullPath)) {
      return c.json({ ok: false, error: 'Invalid path' }, 400);
    }

    // 确保父目录存在
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);

    return c.json({ ok: true, path: filePath });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 删除文件或文件夹
 * DELETE /api/files?jobId=xxx&path=inputs/test.csv
 */
fileRouter.delete('/files', async (c) => {
  try {
    const jobId = c.req.query('jobId');
    const filePath = c.req.query('path');

    if (!jobId || !filePath) {
      return c.json({ ok: false, error: 'jobId and path are required' }, 400);
    }

    // 防止删除 job 根目录
    if (filePath === '' || filePath === '/') {
      return c.json({ ok: false, error: 'Cannot delete job root' }, 400);
    }

    const fullPath = path.join(config.data.dir, jobId, filePath);

    if (!isPathSafe(jobId, fullPath)) {
      return c.json({ ok: false, error: 'Invalid path' }, 400);
    }

    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      await fs.rm(fullPath, { recursive: true });
    } else {
      await fs.unlink(fullPath);
    }

    return c.json({ ok: true, path: filePath });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 重命名文件或文件夹
 * PATCH /api/files/rename
 */
fileRouter.patch('/files/rename', async (c) => {
  try {
    const body = await c.req.json();
    const { jobId, oldPath, newName } = body;

    if (!jobId || !oldPath || !newName) {
      return c.json({ ok: false, error: 'jobId, oldPath and newName are required' }, 400);
    }

    const fullOldPath = path.join(config.data.dir, jobId, oldPath);

    if (!isPathSafe(jobId, fullOldPath)) {
      return c.json({ ok: false, error: 'Invalid path' }, 400);
    }

    const newPath = path.join(path.dirname(fullOldPath), newName);

    await fs.rename(fullOldPath, newPath);

    const relativeNewPath = path.join(path.dirname(oldPath), newName);

    return c.json({ ok: true, oldPath, newPath: relativeNewPath });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * 上传文件到指定目录
 * POST /api/files/upload
 */
fileRouter.post('/files/upload', async (c) => {
  try {
    const body = await c.req.parseBody();
    const jobId = body.jobId as string;
    const targetPath = (body.path as string) || 'inputs';
    const file = body.file;

    if (!jobId || !file || !(file instanceof File)) {
      return c.json({ ok: false, error: 'jobId and file are required' }, 400);
    }

    const targetDir = path.join(config.data.dir, jobId, targetPath);

    if (!isPathSafe(jobId, targetDir)) {
      return c.json({ ok: false, error: 'Invalid path' }, 400);
    }

    await fs.mkdir(targetDir, { recursive: true });

    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(targetDir, fileName);

    await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));

    // 创建快照（数据集变化）
    try {
      await createSnapshot(jobId, 'dataset_changed');
    } catch (error) {
      console.error('Failed to create snapshot:', error);
    }

    return c.json({
      ok: true,
      path: `${targetPath}/${fileName}`,
      name: fileName,
      size: file.size,
    });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

export default fileRouter;