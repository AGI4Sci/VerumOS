# VerumOS Debug Log

## [2026-03-23] Bug 1: Job 重命名失败 ✅ 已修复

### 现象
```
重命名失败: jobId, oldPath and newName are required
```

### 分析
前端 `contextAction('rename')` 调用的是 `/api/files/rename` API（文件重命名），但对于 `type === 'job'` 的情况：
- `jobId` 有值
- `path` 为空字符串
- `oldPath` 是必填参数，导致 API 返回 400 错误

### 修复
Job 重命名现在调用 `PATCH /api/jobs/:jobId` API。

---

## [2026-03-23] Bug 2: Job ID 和目录名不一致 ✅ 已修复

### 现象
- API 返回的 job.id 和实际目录名不同
- 例如：API 返回 `job_20260322_0718_rilz70`，实际目录是 `job_20260322_0718_ksd3d3`

### 分析
`createJob` 函数调用了两次 `generateJobId()`。

### 修复
`createJobObject` 现在接受 `jobId` 参数，确保 job.id 和目录名一致。

---

## [2026-03-23] Bug 3: 浏览器 prompt() 可能被阻止 ✅ 已修复

### 现象
点击 "+" 按钮创建新 Job 时，没有看到名称输入对话框。

### 分析
现代浏览器可能阻止 `window.prompt()`。

### 修复
前端 `createNewJob()` 现在使用自定义的 `showInputDialog()`。

---

## [2026-03-23] Bug 4: 右键菜单对 Job 类型处理不完整 ✅ 已修复

### 现象
右键点击 Job 项目时，上下文菜单选项不适用于 Job 类型。

### 修复
`showContextMenu()` 现在根据 `type` 显示不同的菜单选项：
- Job: 重命名、删除
- Folder: 打开、重命名、删除
- File: 打开、重命名、下载、删除