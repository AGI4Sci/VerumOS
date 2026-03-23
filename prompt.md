# 快照功能设计方案

## 问题描述

在 job 工作目录设置快照功能，支持：
1. 在关键节点自动创建快照（文件/信息修改时）
2. 编辑历史消息，从该点重新执行
3. 用户可选择：回退版本重新执行 OR 保持当前状态继续
4. 手动触发快照

核心问题：**快照的边界在哪？数据要不要进快照？**

## 根因分析

当前 `job.json` 只记录执行轨迹，没有版本控制能力：
- 无法回退到之前的状态
- 无法从某个点 fork 出新分支
- 编辑历史后无法比较差异

## 快照边界设计

### 不进快照的内容

| 内容 | 原因 |
|------|------|
| `inputs/*.csv` | 原始数据，不会改变，数据量大 |
| `outputs/*.csv` | 可通过重新执行脚本生成 |
| `outputs/*.json` | 中间结果，可重新生成 |

### 进快照的内容

| 内容 | 说明 |
|------|------|
| `requirement.md` | 需求文档，AI 可能修改 |
| `analysis.py` | 生成的脚本，AI 可能修改 |
| `state.messages` | 对话历史 |
| `state.datasets` | 数据集元信息（只存引用） |
| `traces` 片段 | 当前操作前的执行轨迹 |

### 快照元数据

```typescript
interface Snapshot {
  id: string;                    // 快照 ID
  jobId: string;                 // 所属 Job
  timestamp: string;             // 创建时间
  type: 'pre_operation' | 'post_operation' | 'manual';
  operation?: string;            // 操作描述（如 "execute_requirement"）
  parentSnapshotId?: string;     // 父快照 ID（用于分支）
  
  // 快照内容（存储在单独文件中）
  contentRef: string;            // 指向 snapshots/{id}.json
  
  // 摘要（用于 UI 展示）
  summary: {
    messageCount: number;
    datasetCount: number;
    hasRequirement: boolean;
    hasScript: boolean;
  };
}
```

## 解决方案

### 1. 目录结构

```
data/job_20260323_1201_48sum3/
├── job.json              # 元数据 + 轨迹 + 状态 + 快照索引
├── snapshots/            # 快照目录
│   ├── snap_001.json     # 快照内容
│   ├── snap_002.json
│   └── ...
├── inputs/
├── outputs/
├── requirement.md
└── analysis.py
```

### 2. job.json 扩展

```json
{
  "id": "job_xxx",
  "sessionId": "sess_xxx",
  "status": "running",
  "traces": [...],
  "state": {...},
  "snapshots": [
    {
      "id": "snap_001",
      "timestamp": "2026-03-23T04:02:00Z",
      "type": "pre_operation",
      "operation": "execute_requirement",
      "summary": {
        "messageCount": 2,
        "datasetCount": 3,
        "hasRequirement": true,
        "hasScript": false
      }
    },
    {
      "id": "snap_002",
      "timestamp": "2026-03-23T04:02:35Z",
      "type": "post_operation",
      "operation": "execute_requirement",
      "parentSnapshotId": "snap_001",
      "summary": {
        "messageCount": 4,
        "datasetCount": 3,
        "hasRequirement": true,
        "hasScript": true
      }
    }
  ],
  "activeSnapshotId": "snap_002"  // 当前活跃快照
}
```

### 3. 快照内容 (snapshots/snap_xxx.json)

```json
{
  "id": "snap_001",
  "jobId": "job_xxx",
  "timestamp": "2026-03-23T04:02:00Z",
  "type": "pre_operation",
  
  "state": {
    "messages": [...],       // 对话历史
    "datasets": [...]        // 数据集引用
  },
  
  "files": {
    "requirement.md": "# 需求文档\n...",
    "analysis.py": "import pandas as pd\n..."
  },
  
  "traces": [...]           // 截至该快照的执行轨迹
}
```

### 4. 核心操作

#### 快照触发时机

**自动触发**（关键节点）：
- 需求文档保存时
- 执行分析方案前
- 分析脚本生成后
- 数据集变化时（新增/删除数据集）

**手动触发**：
- 用户点击"创建快照"按钮

#### 创建快照
```typescript
async function createSnapshot(
  jobId: string, 
  type: 'auto' | 'manual',
  trigger: string  // 触发原因，如 "requirement_saved", "pre_execute", "script_generated"
): Promise<Snapshot> {
  const job = await loadJob(jobId);
  
  // 检查是否有实质变化，避免无意义的快照
  const lastSnapshot = job.snapshots[job.snapshots.length - 1];
  if (lastSnapshot && !hasMaterialChange(job, lastSnapshot)) {
    return null;  // 无变化，不创建快照
  }
  
  const snapshot: Snapshot = {
    id: generateSnapshotId(),
    jobId,
    timestamp: new Date().toISOString(),
    type,
    trigger,
    parentSnapshotId: job.activeSnapshotId,
    contentRef: `snapshots/${snapshotId}.json`,
    summary: {
      messageCount: job.state.messages.length,
      datasetCount: job.state.datasets.length,
      hasRequirement: await fileExists(`${jobDir}/requirement.md`),
      hasScript: await fileExists(`${jobDir}/analysis.py`)
    }
  };
  
  // 保存快照内容
  const snapshotContent = {
    id: snapshot.id,
    jobId,
    timestamp: snapshot.timestamp,
    state: job.state,
    files: await loadJobFiles(jobId),
    traces: job.traces
  };
  
  await writeFile(`${jobDir}/snapshots/${snapshot.id}.json`, JSON.stringify(snapshotContent));
  
  // 更新 job.json
  job.snapshots.push(snapshot);
  job.activeSnapshotId = snapshot.id;
  await saveJob(job);
  
  return snapshot;
}

function hasMaterialChange(job: Job, lastSnapshot: Snapshot): boolean {
  // 检查是否有实质变化
  const content = await loadSnapshotContent(job.id, lastSnapshot.id);
  
  // 消息数量变化
  if (job.state.messages.length !== content.state.messages.length) return true;
  
  // 数据集变化
  if (job.state.datasets.length !== content.state.datasets.length) return true;
  
  // 需求文档变化
  const currentReq = await readFile(`${jobDir}/requirement.md`);
  if (currentReq !== content.files['requirement.md']) return true;
  
  // 脚本变化
  const currentScript = await readFile(`${jobDir}/analysis.py`);
  if (currentScript !== content.files['analysis.py']) return true;
  
  return false;
}
```

#### 编辑历史消息

当用户编辑某条历史消息时，提供两种选择：

```typescript
interface EditHistoryOptions {
  mode: 'revert_and_reexecute' | 'keep_and_continue';
}

async function editHistoryMessage(
  jobId: string,
  messageIndex: number,
  newContent: string,
  options: EditHistoryOptions
): Promise<Job> {
  const job = await loadJob(jobId);
  
  // 找到该消息对应的快照
  const targetSnapshot = findSnapshotByMessageIndex(job, messageIndex);
  
  if (options.mode === 'revert_and_reexecute') {
    // 模式1: 回退版本重新执行
    // 1. 先创建当前状态的快照（以便后续恢复）
    await createSnapshot(jobId, 'auto', 'pre_edit_revert');
    
    // 2. Revert 到目标快照
    await revertToSnapshot(jobId, targetSnapshot.id);
    
    // 3. 修改消息内容
    job.state.messages[messageIndex].content = newContent;
    await saveJob(job);
    
    // 4. 自动触发重新执行（用户确认后）
    // 前端显示确认对话框："是否从修改点重新执行？"
    
  } else {
    // 模式2: 保持当前状态，只修改历史记录
    // 创建一个"历史修改标记"，不影响当前状态
    job.state.messages[messageIndex].content = newContent;
    job.state.messages[messageIndex].edited = true;
    job.state.messages[messageIndex].editedAt = new Date().toISOString();
    await saveJob(job);
    
    // 创建新快照记录这次修改
    await createSnapshot(jobId, 'auto', 'history_edited');
  }
  
  return job;
}
```

#### Revert 到快照（模式1核心）
```typescript
async function revertToSnapshot(jobId: string, snapshotId: string): Promise<void> {
  const job = await loadJob(jobId);
  const snapshot = job.snapshots.find(s => s.id === snapshotId);
  
  if (!snapshot) throw new Error('Snapshot not found');
  
  // 加载快照内容
  const content = await loadSnapshotContent(jobId, snapshotId);
  
  // 恢复状态
  job.state = JSON.parse(JSON.stringify(content.state));  // 深拷贝
  job.traces = [...content.traces];
  job.activeSnapshotId = snapshotId;
  
  // 恢复文件
  const jobDir = getJobDir(jobId);
  for (const [filename, fileContent] of Object.entries(content.files)) {
    await writeFile(`${jobDir}/${filename}`, fileContent);
  }
  
  // 注意：不删除 outputs/ 目录的内容，用户可能需要参考
  // 但会更新 job.json 中的状态，后续执行会覆盖 outputs
  
  await saveJob(job);
}
```

#### Fork 新会话（可选功能）
```typescript
async function forkFromSnapshot(
  jobId: string, 
  snapshotId: string
): Promise<Job> {
  const sourceJob = await loadJob(jobId);
  const snapshot = sourceJob.snapshots.find(s => s.id === snapshotId);
  
  // 创建新 Job
  const newJob = await createJob(newSessionId());
  
  // 复制快照状态到新 Job
  const content = await loadSnapshotContent(jobId, snapshotId);
  newJob.state = JSON.parse(JSON.stringify(content.state));
  newJob.traces = [...content.traces];
  
  // 复制需求文档和脚本
  const newJobDir = getJobDir(newJob.id);
  for (const [filename, fileContent] of Object.entries(content.files)) {
    await writeFile(`${newJobDir}/${filename}`, fileContent);
  }
  
  // 创建 inputs 的符号链接或复制引用
  // 注意：不复制数据文件本身
  
  // 记录 fork 来源
  newJob.forkedFrom = {
    jobId,
    snapshotId,
    timestamp: new Date().toISOString()
  };
  
  await saveJob(newJob);
  return newJob;
}
```

### 5. API 端点

```
POST /api/jobs/:jobId/snapshots              # 创建快照（手动）
GET  /api/jobs/:jobId/snapshots              # 列出快照
GET  /api/jobs/:jobId/snapshots/:snapId      # 获取快照详情
POST /api/jobs/:jobId/snapshots/:snapId/revert  # Revert 到快照

# 编辑历史消息
PUT  /api/jobs/:jobId/messages/:index        # 编辑消息
  Body: { content: string, mode: 'revert_and_reexecute' | 'keep_and_continue' }
```

### 6. 前端 UI

#### 快照视图

在 Job Explorer 中添加快照节点：

```
▼ 001
  ▼ inputs/
    └── count_matrix.csv
  ▼ outputs/
    └── normalized_matrix.csv
  ▼ snapshots/              # 新增
    ├─ 📸 12:02:35 执行前    # 可展开查看快照内容
    ├─ 📸 12:02:40 执行后
    └─ 📸 12:03:15 手动保存
  ├── requirement.md
  └── analysis.py
```

#### 编辑历史消息流程

1. 用户在聊天区点击某条消息的"编辑"按钮
2. 弹出编辑对话框，显示两种选项：
   - **回退并重新执行**：恢复到该消息时的状态，修改后重新执行后续操作
   - **仅修改记录**：保留当前状态，只修改历史记录
3. 选择后执行相应操作
4. 如果选择"回退并重新执行"，提示用户是否立即重新执行

#### 快照上下文菜单

- 查看快照内容（显示当时的消息、需求文档、脚本）
- Revert 到此版本
- 与当前版本比较差异

## 修改步骤

### Step 1: 扩展类型定义

修改 `src/job/types.ts`：

```typescript
export type SnapshotType = 'auto' | 'manual';

export type SnapshotTrigger = 
  | 'requirement_saved'
  | 'pre_execute'
  | 'post_execute'
  | 'script_generated'
  | 'dataset_changed'
  | 'manual'
  | 'pre_edit_revert'
  | 'history_edited';

export interface SnapshotSummary {
  messageCount: number;
  datasetCount: number;
  hasRequirement: boolean;
  hasScript: boolean;
}

export interface Snapshot {
  id: string;
  jobId: string;
  timestamp: string;
  type: SnapshotType;
  trigger: SnapshotTrigger;  // 触发原因
  parentSnapshotId?: string;
  contentRef: string;
  summary: SnapshotSummary;
}

export interface SnapshotContent {
  id: string;
  jobId: string;
  timestamp: string;
  state: JobState;
  files: Record<string, string>;  // requirement.md, analysis.py
  traces: TraceEntry[];
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  edited?: boolean;           // 是否被编辑过
  editedAt?: string;          // 编辑时间
  originalContent?: string;   // 原始内容（编辑后保留）
}

export interface Job {
  // ... 现有字段
  snapshots: Snapshot[];
  activeSnapshotId?: string;
  forkedFrom?: {
    jobId: string;
    snapshotId: string;
    timestamp: string;
  };
}
```

### Step 2: 创建快照管理器

新建 `src/job/snapshot-manager.ts`：

```typescript
import { promises as fs } from 'fs';
import path from 'path';
import type { Job, Snapshot, SnapshotContent, SnapshotTrigger } from './types.js';
import { loadJob, saveJob, getJobDir } from './manager.js';

export async function createSnapshot(
  jobId: string,
  trigger: SnapshotTrigger,
  type: 'auto' | 'manual' = 'auto'
): Promise<Snapshot | null> {
  const job = await loadJob(jobId);
  const jobDir = getJobDir(jobId);
  
  // 检查是否有实质变化
  const lastSnapshot = job.snapshots[job.snapshots.length - 1];
  if (lastSnapshot && !await hasMaterialChange(jobDir, job, lastSnapshot)) {
    return null;
  }
  
  const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  
  // 读取当前文件
  const files: Record<string, string> = {};
  try {
    files['requirement.md'] = await fs.readFile(path.join(jobDir, 'requirement.md'), 'utf-8');
  } catch {}
  try {
    files['analysis.py'] = await fs.readFile(path.join(jobDir, 'analysis.py'), 'utf-8');
  } catch {}
  
  // 创建快照内容
  const content: SnapshotContent = {
    id: snapshotId,
    jobId,
    timestamp: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(job.state)),
    files,
    traces: [...job.traces]
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
      hasScript: !!files['analysis.py']
    }
  };
  
  // 更新 job
  job.snapshots.push(snapshot);
  job.activeSnapshotId = snapshotId;
  await saveJob(job);
  
  return snapshot;
}

async function hasMaterialChange(
  jobDir: string,
  job: Job,
  lastSnapshot: Snapshot
): Promise<boolean> {
  const snapshotsDir = path.join(jobDir, 'snapshots');
  const contentPath = path.join(snapshotsDir, `${lastSnapshot.id}.json`);
  
  try {
    const content: SnapshotContent = JSON.parse(
      await fs.readFile(contentPath, 'utf-8')
    );
    
    // 消息数量变化
    if (job.state.messages.length !== content.state.messages.length) return true;
    
    // 数据集数量变化
    if (job.state.datasets.length !== content.state.datasets.length) return true;
    
    // 需求文档变化
    try {
      const currentReq = await fs.readFile(path.join(jobDir, 'requirement.md'), 'utf-8');
      if (currentReq !== content.files['requirement.md']) return true;
    } catch {}
    
    // 脚本变化
    try {
      const currentScript = await fs.readFile(path.join(jobDir, 'analysis.py'), 'utf-8');
      if (currentScript !== content.files['analysis.py']) return true;
    } catch {}
    
    return false;
  } catch {
    return true;  // 无法读取时假设有变化
  }
}

export async function loadSnapshotContent(
  jobId: string,
  snapshotId: string
): Promise<SnapshotContent> {
  const jobDir = getJobDir(jobId);
  const contentPath = path.join(jobDir, 'snapshots', `${snapshotId}.json`);
  return JSON.parse(await fs.readFile(contentPath, 'utf-8'));
}

export async function revertToSnapshot(jobId: string, snapshotId: string): Promise<void> {
  const job = await loadJob(jobId);
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
  
  await saveJob(job);
}

export async function listSnapshots(jobId: string): Promise<Snapshot[]> {
  const job = await loadJob(jobId);
  return job.snapshots;
}

export async function findSnapshotByMessageIndex(
  jobId: string,
  messageIndex: number
): Promise<Snapshot | null> {
  const job = await loadJob(jobId);
  
  // 找到包含该消息的最新快照
  for (let i = job.snapshots.length - 1; i >= 0; i--) {
    const snapshot = job.snapshots[i];
    if (snapshot.summary.messageCount > messageIndex) {
      return snapshot;
    }
  }
  
  return job.snapshots[0] || null;
}
```

### Step 3: 集成到关键节点

修改 `src/routes/requirement.ts`：

```typescript
// 保存需求文档时创建快照
app.post('/api/requirement/:sessionId', async (c) => {
  // ... 现有保存逻辑
  
  // 创建快照
  if (jobId) {
    await createSnapshot(jobId, 'requirement_saved');
  }
  
  return c.json({ ok: true, ... });
});
```

修改 `src/runtime/agent-loop.ts` 或 `src/routes/chat.ts`：

```typescript
// 执行需求前创建快照
if (message.includes('执行需求文档中的分析方案')) {
  await createSnapshot(jobId, 'pre_execute');
}

// ... 执行操作 ...

// 执行完成后创建快照
if (isExecuteIntent) {
  await createSnapshot(jobId, 'post_execute');
}
```

修改 `src/routes/file.ts`：

```typescript
// 上传文件导致数据集变化时创建快照
app.post('/api/files/upload', async (c) => {
  // ... 上传逻辑
  
  await createSnapshot(jobId, 'dataset_changed');
});
```

### Step 4: 添加 API 路由

新建 `src/routes/snapshot.ts`：

```typescript
import { Hono } from 'hono';
import { 
  createSnapshot, 
  loadSnapshotContent, 
  revertToSnapshot, 
  listSnapshots 
} from '../job/snapshot-manager.js';

const app = new Hono();

// 手动创建快照
app.post('/api/jobs/:jobId/snapshots', async (c) => {
  const jobId = c.req.param('jobId');
  const snapshot = await createSnapshot(jobId, 'manual', 'manual');
  if (!snapshot) {
    return c.json({ ok: true, message: 'No changes, snapshot not created' });
  }
  return c.json({ ok: true, snapshot });
});

// 列出快照
app.get('/api/jobs/:jobId/snapshots', async (c) => {
  const jobId = c.req.param('jobId');
  const snapshots = await listSnapshots(jobId);
  return c.json({ ok: true, snapshots });
});

// 获取快照详情
app.get('/api/jobs/:jobId/snapshots/:snapId', async (c) => {
  const jobId = c.req.param('jobId');
  const snapId = c.req.param('snapId');
  const content = await loadSnapshotContent(jobId, snapId);
  return c.json({ ok: true, content });
});

// Revert 到快照
app.post('/api/jobs/:jobId/snapshots/:snapId/revert', async (c) => {
  const jobId = c.req.param('jobId');
  const snapId = c.req.param('snapId');
  await revertToSnapshot(jobId, snapId);
  return c.json({ ok: true, message: 'Reverted successfully' });
});

export default app;
```

添加编辑消息 API（在 `src/routes/job.ts` 或新建）：

```typescript
// 编辑历史消息
app.put('/api/jobs/:jobId/messages/:index', async (c) => {
  const jobId = c.req.param('jobId');
  const index = parseInt(c.req.param('index'));
  const { content, mode } = await c.req.json();
  
  const job = await loadJob(jobId);
  
  if (index < 0 || index >= job.state.messages.length) {
    return c.json({ ok: false, error: 'Invalid message index' }, 400);
  }
  
  if (mode === 'revert_and_reexecute') {
    // 先创建当前状态的快照
    await createSnapshot(jobId, 'pre_edit_revert');
    
    // 找到对应的快照并 revert
    const snapshot = await findSnapshotByMessageIndex(jobId, index);
    if (snapshot) {
      await revertToSnapshot(jobId, snapshot.id);
    }
    
    // 修改消息
    job.state.messages[index].content = content;
    job.state.messages[index].edited = true;
    job.state.messages[index].editedAt = new Date().toISOString();
    
    // 裁剪后续消息（因为要重新执行）
    job.state.messages = job.state.messages.slice(0, index + 1);
    
    await saveJob(job);
    
    return c.json({ 
      ok: true, 
      mode: 'reverted',
      message: '已回退到修改点，可以重新执行'
    });
    
  } else {
    // 仅修改记录
    const originalContent = job.state.messages[index].content;
    job.state.messages[index].content = content;
    job.state.messages[index].edited = true;
    job.state.messages[index].editedAt = new Date().toISOString();
    job.state.messages[index].originalContent = originalContent;
    
    await saveJob(job);
    await createSnapshot(jobId, 'history_edited');
    
    return c.json({ 
      ok: true, 
      mode: 'edited',
      message: '历史记录已修改'
    });
  }
});
```

## 测试验证

### 功能测试

1. **快照创建**：
   - [ ] 保存需求文档时自动创建快照
   - [ ] 执行需求前自动创建快照
   - [ ] 执行需求后自动创建快照
   - [ ] 上传文件后自动创建快照
   - [ ] 手动创建快照
   - [ ] 无变化时不创建快照

2. **编辑历史消息**：
   - [ ] 编辑消息，选择"仅修改记录"，历史记录更新，当前状态不变
   - [ ] 编辑消息，选择"回退并重新执行"，状态回退到该消息点
   - [ ] 回退后，后续消息被裁剪
   - [ ] 编辑后的消息显示"已编辑"标记

3. **Revert 到快照**：
   - [ ] Revert 后消息历史恢复
   - [ ] Revert 后需求文档恢复
   - [ ] Revert 后分析脚本恢复
   - [ ] Revert 后数据集引用恢复

4. **快照列表**：
   - [ ] 列出所有快照
   - [ ] 查看快照详情
   - [ ] 快照按时间排序

### 边界测试

- [ ] 大数据量下的快照性能（数据文件不应被复制）
- [ ] 多次 revert 后状态正确
- [ ] 编辑第一条消息
- [ ] 编辑最后一条消息
- [ ] 没有快照时编辑消息的行为

### 回归测试

- [ ] 现有 Job 创建/恢复功能正常
- [ ] 文件上传/预览功能正常
- [ ] 需求文档保存/执行功能正常

### UI 测试

- [ ] 快照节点在文件树中正确显示
- [ ] 编辑消息对话框正确显示两种选项
- [ ] 快照上下文菜单功能正常

### Step 5: 前端 UI 更新

修改 `web/index.html`：

#### 1. 在消息上添加编辑按钮

```html
<div class="message-text">
  ${formatText(msg.content)}
  ${msg.role === 'user' ? `
    <button class="message-edit-btn" onclick="editMessage(${index})">✏️</button>
  ` : ''}
</div>
```

#### 2. 编辑消息对话框

```html
<div class="edit-dialog" id="editDialog" style="display:none">
  <div class="edit-dialog-box">
    <div class="edit-dialog-title">编辑消息</div>
    <textarea class="edit-dialog-input" id="editDialogInput"></textarea>
    
    <div class="edit-dialog-options">
      <label class="edit-option">
        <input type="radio" name="editMode" value="keep_and_continue" checked>
        <div class="edit-option-content">
          <div class="edit-option-title">仅修改记录</div>
          <div class="edit-option-desc">保留当前状态，只修改历史记录</div>
        </div>
      </label>
      <label class="edit-option">
        <input type="radio" name="editMode" value="revert_and_reexecute">
        <div class="edit-option-content">
          <div class="edit-option-title">回退并重新执行</div>
          <div class="edit-option-desc">恢复到该消息时的状态，修改后可重新执行</div>
        </div>
      </label>
    </div>
    
    <div class="edit-dialog-actions">
      <button class="dialog-btn secondary" onclick="closeEditDialog()">取消</button>
      <button class="dialog-btn primary" onclick="confirmEditMessage()">确认</button>
    </div>
  </div>
</div>
```

#### 3. 快照节点渲染

```javascript
function renderSnapshots(snapshots) {
  if (!snapshots || snapshots.length === 0) {
    return '<div style="padding:8px 24px;color:var(--text-faint);font-size:12px">暂无快照</div>';
  }
  
  const triggerLabels = {
    'requirement_saved': '需求文档保存',
    'pre_execute': '执行前',
    'post_execute': '执行后',
    'script_generated': '脚本生成',
    'dataset_changed': '数据集变化',
    'manual': '手动保存',
    'pre_edit_revert': '编辑回退前',
    'history_edited': '历史编辑'
  };
  
  return snapshots.map(snap => {
    const time = new Date(snap.timestamp).toLocaleTimeString();
    const label = triggerLabels[snap.trigger] || snap.trigger;
    return `
      <div class="tree-file" 
           onclick="viewSnapshot('${snap.id}')"
           oncontextmenu="showSnapshotContextMenu(event, '${snap.id}')">
        <span class="tree-file-icon">📸</span>
        <span class="tree-file-name">${time} ${label}</span>
      </div>
    `;
  }).join('');
}
```

#### 4. 编辑消息逻辑

```javascript
let editingMessageIndex = null;

function editMessage(index) {
  editingMessageIndex = index;
  const job = jobs.find(j => j.id === currentJobId);
  const message = job.state.messages[index];
  
  document.getElementById('editDialogInput').value = message.content;
  document.getElementById('editDialog').style.display = 'flex';
}

async function confirmEditMessage() {
  const newContent = document.getElementById('editDialogInput').value.trim();
  const mode = document.querySelector('input[name="editMode"]:checked').value;
  
  try {
    const response = await fetch(`/api/jobs/${currentJobId}/messages/${editingMessageIndex}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newContent, mode })
    });
    
    const result = await response.json();
    
    if (result.ok) {
      if (mode === 'revert_and_reexecute') {
        // 重新加载历史消息
        await loadJobHistory(currentJobId);
        // 提示用户
        addMessage('system', '已回退到修改点。您可以在输入框中重新描述需求，或点击"执行"按钮。');
      } else {
        // 刷新当前消息显示
        await loadJobHistory(currentJobId);
      }
    }
  } catch (error) {
    alert(`编辑失败: ${error.message}`);
  }
  
  closeEditDialog();
}

function closeEditDialog() {
  document.getElementById('editDialog').style.display = 'none';
  editingMessageIndex = null;
}
```

## 收尾工作

- [ ] 修改相关代码文件
- [ ] 执行测试验证（必须）
- [ ] 更新 README.md 使项目状态与描述一致
- [ ] 提交 git commit，message 格式：`feat: add snapshot support for job workspace`
- [ ] push 到远程仓库

## 关于快照边界的总结

**最终决定**：

| 内容 | 是否快照 | 原因 |
|------|---------|------|
| 需求文档 | ✅ | AI 可能修改，需要版本追踪 |
| 分析脚本 | ✅ | AI 生成，可能迭代修改 |
| 对话历史 | ✅ | 记录用户交互，支持回退 |
| 数据集元信息 | ✅ | 轻量级，记录数据引用 |
| inputs/ 数据文件 | ❌ | 数据量大，原始数据不变 |
| outputs/ 输出文件 | ❌ | 可重新生成 |

**存储策略**：
- 快照只存储状态和代码文件
- 数据文件通过引用关联
- 快照文件大小可控（KB 级别，非 GB 级别）
