/**
 * Snapshot Manager - 快照管理器
 *
 * 提供：
 * - createSnapshot: 创建快照
 * - loadSnapshotContent: 加载快照内容
 * - revertToSnapshot: 回退到快照
 * - listSnapshots: 列出快照
 * - editHistoryMessage: 编辑历史消息
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import type { Job, Snapshot, SnapshotContent, SnapshotTrigger } from './types.js';
import { getJob, updateJob } from './manager.js';

/**
 * 获取 Job 目录路径
 */
function getJobDir(jobId: string): string {
  return path.join(config.data.dir, jobId);
}

/**
 * 创建快照
 *
 * @param jobId Job ID
 * @param trigger 触发原因
 * @param type 快照类型
 * @returns 创建的快照，如果无变化则返回 null
 */
export async function createSnapshot(
  jobId: string,
  trigger: SnapshotTrigger,
  type: 'auto' | 'manual' = 'auto'
): Promise<Snapshot | null> {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const jobDir = getJobDir(jobId);
  const snapshots = job.snapshots || [];

  // 检查是否有实质变化
  const lastSnapshot = snapshots[snapshots.length - 1];
  if (lastSnapshot && !(await hasMaterialChange(jobDir, job, lastSnapshot))) {
    return null;
  }

  const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // 读取当前文件
  const files: Record<string, string> = {};
  try {
    files['requirement.md'] = await fs.readFile(
      path.join(jobDir, 'requirement.md'),
      'utf-8'
    );
  } catch {
    // 文件不存在，忽略
  }
  try {
    files['analysis.py'] = await fs.readFile(
      path.join(jobDir, 'analysis.py'),
      'utf-8'
    );
  } catch {
    // 文件不存在，忽略
  }

  // 创建快照内容
  const content: SnapshotContent = {
    id: snapshotId,
    jobId,
    timestamp: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(job.state)),
    files,
    traces: [...job.traces],
  };

  // 确保快照目录存在
  const snapshotsDir = path.join(jobDir, 'snapshots');
  await fs.mkdir(snapshotsDir, { recursive: true });

  // 保存快照内容
  await fs.writeFile(
    path.join(snapshotsDir, `${snapshotId}.json`),
    JSON.stringify(content, null, 2)
  );

  // 创建快照元数据
  const snapshot: Snapshot = {
    id: snapshotId,
    jobId,
    timestamp: content.timestamp,
    type,
    trigger,
    parentSnapshotId: job.activeSnapshotId,
    contentRef: `snapshots/${snapshotId}.json`,
    summary: {
      messageCount: job.state.messages.length,
      datasetCount: job.state.datasets.length,
      hasRequirement: !!files['requirement.md'],
      hasScript: !!files['analysis.py'],
    },
  };

  // 更新 job
  await updateJob(jobId, {
    snapshots: [...snapshots, snapshot],
    activeSnapshotId: snapshotId,
  });

  return snapshot;
}

/**
 * 检查是否有实质变化
 */
async function hasMaterialChange(
  jobDir: string,
  job: Job,
  lastSnapshot: Snapshot
): Promise<boolean> {
  const snapshotsDir = path.join(jobDir, 'snapshots');
  const contentPath = path.join(snapshotsDir, `${lastSnapshot.id}.json`);

  try {
    const contentText = await fs.readFile(contentPath, 'utf-8');
    const content: SnapshotContent = JSON.parse(contentText);

    // 消息数量变化
    if (job.state.messages.length !== content.state.messages.length) return true;

    // 数据集数量变化
    if (job.state.datasets.length !== content.state.datasets.length) return true;

    // 需求文档变化
    try {
      const currentReq = await fs.readFile(
        path.join(jobDir, 'requirement.md'),
        'utf-8'
      );
      if (currentReq !== content.files['requirement.md']) return true;
    } catch {
      // 文件不存在时，检查快照中是否有
      if (content.files['requirement.md']) return true;
    }

    // 脚本变化
    try {
      const currentScript = await fs.readFile(
        path.join(jobDir, 'analysis.py'),
        'utf-8'
      );
      if (currentScript !== content.files['analysis.py']) return true;
    } catch {
      // 文件不存在时，检查快照中是否有
      if (content.files['analysis.py']) return true;
    }

    return false;
  } catch {
    return true; // 无法读取时假设有变化
  }
}

/**
 * 加载快照内容
 */
export async function loadSnapshotContent(
  jobId: string,
  snapshotId: string
): Promise<SnapshotContent> {
  const jobDir = getJobDir(jobId);
  const contentPath = path.join(jobDir, 'snapshots', `${snapshotId}.json`);
  const contentText = await fs.readFile(contentPath, 'utf-8');
  return JSON.parse(contentText);
}

/**
 * 回退到快照
 */
export async function revertToSnapshot(
  jobId: string,
  snapshotId: string
): Promise<void> {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const content = await loadSnapshotContent(jobId, snapshotId);
  const jobDir = getJobDir(jobId);

  // 恢复状态
  job.state = JSON.parse(JSON.stringify(content.state));
  job.traces = [...content.traces];
  job.activeSnapshotId = snapshotId;

  // 恢复文件
  for (const [filename, fileContent] of Object.entries(content.files)) {
    if (fileContent !== undefined) {
      await fs.writeFile(path.join(jobDir, filename), fileContent);
    }
  }

  await updateJob(jobId, {
    state: job.state,
    traces: job.traces,
    activeSnapshotId: snapshotId,
  });
}

/**
 * 列出快照
 */
export async function listSnapshots(jobId: string): Promise<Snapshot[]> {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }
  return job.snapshots || [];
}

/**
 * 根据消息索引找到对应的快照
 */
export async function findSnapshotByMessageIndex(
  jobId: string,
  messageIndex: number
): Promise<Snapshot | null> {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const snapshots = job.snapshots || [];

  // 找到包含该消息的最新快照
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const snapshot = snapshots[i];
    if (snapshot.summary.messageCount > messageIndex) {
      return snapshot;
    }
  }

  return snapshots[0] || null;
}

/**
 * 编辑历史消息
 */
export async function editHistoryMessage(
  jobId: string,
  messageIndex: number,
  newContent: string,
  mode: 'revert_and_reexecute' | 'keep_and_continue'
): Promise<{ ok: boolean; mode: string; message: string }> {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  if (messageIndex < 0 || messageIndex >= job.state.messages.length) {
    throw new Error('Invalid message index');
  }

  if (mode === 'revert_and_reexecute') {
    // 模式1: 回退版本重新执行
    // 先创建当前状态的快照（以便后续恢复）
    await createSnapshot(jobId, 'pre_edit_revert');

    // 找到对应的快照并 revert
    const snapshot = await findSnapshotByMessageIndex(jobId, messageIndex);
    if (snapshot) {
      await revertToSnapshot(jobId, snapshot.id);
    }

    // 重新获取 job（因为 revert 后状态已更新）
    const updatedJob = await getJob(jobId);
    if (!updatedJob) {
      throw new Error('Job not found after revert');
    }

    // 修改消息
    updatedJob.state.messages[messageIndex].content = newContent;
    updatedJob.state.messages[messageIndex].edited = true;
    updatedJob.state.messages[messageIndex].editedAt = new Date().toISOString();

    // 裁剪后续消息（因为要重新执行）
    updatedJob.state.messages = updatedJob.state.messages.slice(0, messageIndex + 1);

    await updateJob(jobId, {
      state: updatedJob.state,
    });

    return {
      ok: true,
      mode: 'reverted',
      message: '已回退到修改点，可以重新执行',
    };
  } else {
    // 模式2: 仅修改记录
    const originalContent = job.state.messages[messageIndex].content;
    job.state.messages[messageIndex].content = newContent;
    job.state.messages[messageIndex].edited = true;
    job.state.messages[messageIndex].editedAt = new Date().toISOString();
    job.state.messages[messageIndex].originalContent = originalContent;

    await updateJob(jobId, {
      state: job.state,
    });

    await createSnapshot(jobId, 'history_edited');

    return {
      ok: true,
      mode: 'edited',
      message: '历史记录已修改',
    };
  }
}

/**
 * 删除快照
 */
export async function deleteSnapshot(
  jobId: string,
  snapshotId: string
): Promise<boolean> {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const snapshots = job.snapshots || [];
  const index = snapshots.findIndex((s) => s.id === snapshotId);
  if (index === -1) {
    return false;
  }

  // 删除快照文件
  const jobDir = getJobDir(jobId);
  const snapshotPath = path.join(jobDir, 'snapshots', `${snapshotId}.json`);
  try {
    await fs.unlink(snapshotPath);
  } catch {
    // 忽略删除失败
  }

  // 更新 job
  snapshots.splice(index, 1);
  await updateJob(jobId, { snapshots });

  return true;
}
