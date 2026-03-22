# VerumOS Bug 修复 - Job ID 一致性与重命名

## 问题描述

1. **Job 重命名失败**：`重命名失败: jobId, oldPath and newName are required`
2. **Job ID 和目录名不一致**：API 返回的 job.id 和实际目录名不同
3. **浏览器 prompt() 被阻止**：点击 "+" 按钮创建 Job 时无法输入名称

## 根因分析

### Bug 1: 重命名调用错误 API

前端 `contextAction('rename')` 对所有类型（job/folder/file）都调用 `/api/files/rename`，但对于 `type === 'job'`：
- `path` 为空
- `oldPath` 是必填参数

正确做法：Job 重命名应调用 `PATCH /api/jobs/:jobId`。

### Bug 2: generateJobId() 被调用两次

```typescript
// manager.ts
export async function createJob(sessionId: string, intent?: Intent): Promise<string> {
  const jobId = generateJobId();  // 第1次 - 目录名
  const jobDir = getJobDir(jobId);

  const job = createJobObject(sessionId, intent);  // 内部第2次

  return jobId;
}

// types.ts
export function createJob(sessionId: string, intent?: Intent): Job {
  return {
    id: generateJobId(),  // 和目录名不同！
  };
}
```

### Bug 3: window.prompt() 不可靠

现代浏览器可能阻止 `window.prompt()`，应使用自定义的 Input Dialog。

---

## 解决方案

### Step 1: 修复 `src/job/types.ts` - createJobObject 接受 jobId 参数

```typescript
/**
 * 创建初始 Job
 */
export function createJob(sessionId: string, intent?: Intent, jobId?: string): Job {
  const now = new Date().toISOString();
  return {
    id: jobId || generateJobId(),  // 使用传入的 jobId 或生成新的
    sessionId,
    status: 'created',
    createdAt: now,
    updatedAt: now,
    intent,
    traces: [],
    state: { datasets: [], messages: [] },
  };
}
```

### Step 2: 修复 `src/job/manager.ts` - 传递 jobId 给 createJobObject

```typescript
export async function createJob(sessionId: string, intent?: Intent): Promise<string> {
  const jobId = generateJobId();
  const jobDir = getJobDir(jobId);
  const inputsDir = path.join(jobDir, 'inputs');
  const outputsDir = path.join(jobDir, 'outputs');

  // 创建目录结构
  await fs.mkdir(inputsDir, { recursive: true });
  await fs.mkdir(outputsDir, { recursive: true });

  // 创建 Job 对象 - 传递 jobId
  const job = createJobObject(sessionId, intent, jobId);

  // 写入 job.json
  await fs.writeFile(
    path.join(jobDir, 'job.json'),
    JSON.stringify(job, null, 2)
  );

  return jobId;
}
```

### Step 3: 修复 `web/index.html` - Job 重命名调用正确 API

找到 `contextAction` 函数中的 `case 'rename'` 部分，修改为：

```javascript
case 'rename':
  showInputDialog('重命名', path.split('/').pop(), async (newName) => {
    try {
      let response;
      if (type === 'job') {
        // Job 重命名调用 /api/jobs/:jobId
        response = await fetch(`/api/jobs/${jobId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        });
      } else {
        // 文件/文件夹重命名调用 /api/files/rename
        response = await fetch('/api/files/rename', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId, oldPath: path, newName }),
        });
      }
      const payload = await response.json();
      if (payload.ok) {
        if (type === 'job') {
          await loadJobs();  // 刷新 job 列表
        } else {
          await loadFileTree(jobId, path.split('/').slice(0, -1).join('/') || '');
        }
      } else {
        alert(`重命名失败: ${payload.error}`);
      }
    } catch (error) {
      alert(`重命名失败: ${error.message}`);
    }
  });
  break;
```

### Step 4: 修复 `web/index.html` - Job 删除调用正确 API

找到 `contextAction` 函数中的 `case 'delete'` 部分，修改为：

```javascript
case 'delete':
  const itemName = type === 'job' ? (jobs.find(j => j.id === jobId)?.summary || jobId) : path.split('/').pop();
  if (!confirm(`确定要删除 ${itemName} 吗？`)) return;

  try {
    let response;
    if (type === 'job') {
      response = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
    } else {
      response = await fetch(`/api/files?jobId=${encodeURIComponent(jobId)}&path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
      });
    }
    const payload = await response.json();
    if (payload.ok) {
      if (type === 'job') {
        currentJobId = null;
        await loadJobs();
      } else {
        await loadFileTree(jobId, path.split('/').slice(0, -1).join('/') || '');
      }
    } else {
      alert(`删除失败: ${payload.error}`);
    }
  } catch (error) {
    alert(`删除失败: ${error.message}`);
  }
  break;
```

### Step 5: 修复 `web/index.html` - createNewJob 使用 Input Dialog

找到 `createNewJob` 函数，修改为：

```javascript
async function createNewJob() {
  showInputDialog('新建任务', '', async (name) => {
    try {
      const response = await fetch('/api/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || undefined }),
      });
      const payload = await response.json();
      if (payload.ok) {
        currentJobId = payload.job.id;
        sessionId = payload.job.sessionId;
        await loadJobs();
        connectWebSocket();
      } else {
        alert(`创建失败: ${payload.error}`);
      }
    } catch (error) {
      alert(`创建失败: ${error.message}`);
    }
  });
}
```

### Step 6: 修复 `web/index.html` - 根据类型显示不同上下文菜单

修改 `showContextMenu` 函数，根据 `type` 调整菜单选项：

```javascript
function showContextMenu(event, type, jobId, path = '') {
  event.preventDefault();
  event.stopPropagation();

  contextTarget = { type, jobId, path };

  const menu = document.getElementById('contextMenu');

  // 根据类型显示不同的菜单选项
  if (type === 'job') {
    menu.innerHTML = `
      <div class="context-menu-item" onclick="contextAction('rename')">
        <span>✏️</span> 重命名
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" onclick="contextAction('delete')">
        <span>🗑️</span> 删除
      </div>
    `;
  } else if (type === 'folder') {
    menu.innerHTML = `
      <div class="context-menu-item" onclick="contextAction('open')">
        <span>📂</span> 打开
      </div>
      <div class="context-menu-item" onclick="contextAction('rename')">
        <span>✏️</span> 重命名
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" onclick="contextAction('delete')">
        <span>🗑️</span> 删除
      </div>
    `;
  } else {
    menu.innerHTML = `
      <div class="context-menu-item" onclick="contextAction('open')">
        <span>📂</span> 打开
      </div>
      <div class="context-menu-item" onclick="contextAction('rename')">
        <span>✏️</span> 重命名
      </div>
      <div class="context-menu-item" onclick="contextAction('download')">
        <span>⬇️</span> 下载
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" onclick="contextAction('delete')">
        <span>🗑️</span> 删除
      </div>
    `;
  }

  menu.style.display = 'block';
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
}
```

---

## 验收标准

1. **Job ID 一致性**：
   - 创建新 Job 后，API 返回的 job.id 和目录名一致
   - 刷新页面后 job 列表正确显示

2. **Job 重命名**：
   - 右键点击 Job，显示"重命名"和"删除"选项
   - 重命名成功后 job 列表更新

3. **Job 删除**：
   - 删除 Job 后，目录被删除，列表更新

4. **新建 Job**：
   - 点击 "+" 显示 Input Dialog
   - 输入名称后创建成功

---

## 收尾工作

- [ ] 修改相关代码文件
- [ ] 清理 debug.md 中已解决的问题
- [ ] 提交 git commit，message 格式：`fix: resolve job ID mismatch and rename issues`
- [ ] push 到远程仓库
