# Vibe Coding 工作流教程

本文档记录使用 OpenClaw + Claude Code 进行协作式编程的完整工作流程。

---

## 核心理念

**AI 负责方案设计与文档化，Claude Code 负责代码执行。**

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   OpenClaw   │────▶│  prompt.md  │────▶│ Claude Code │
│  方案讨论    │     │  方案文档   │     │  代码执行   │
└─────────────┘     └─────────────┘     └─────────────┘
       ▲                                        │
       └────────────────────────────────────────┘
                      反馈循环
```

---

## 工作流程

### Step 1: 启动讨论

在 OpenClaw 中描述你的需求或问题：

```
阅读 README.md 理解项目、阅读 debug.md 分析问题；将解决方案放在 prompt.md 里面
```

**关键点**：
- 明确告诉 AI 要阅读哪些文件（README.md、debug.md）
- 明确输出目标（写入 prompt.md）

### Step 2: AI 分析并输出方案

OpenClaw 会：
1. 读取项目 README.md 理解背景
2. 读取 debug.md 获取之前的调试信息（如存在）
3. 按照 vibe-coding skill 规范，将方案写入 `prompt.md`

**prompt.md 必须包含**：
- 问题描述
- 根因分析
- 解决方案
- 修改步骤（含完整代码片段）
- **测试验证（必须）**：功能测试、边界测试、回归测试的具体步骤
- 验收标准
- 收尾工作清单

### Step 3: 执行方案

调用 Claude Code 执行 prompt.md：

```bash
cd /path/to/project
claude  # 或你的执行命令
```

Claude Code 会：
- 读取 prompt.md
- 按步骤修改代码文件
- 执行 git commit / push

### Step 4: 反馈与迭代

**成功**：
- 更新 README.md（如有架构/功能变化）
- 清理 debug.md 中已解决的问题

**失败**：
1. 将错误信息写入 `debug.md`：
   ```markdown
   ## [日期] 问题标题

   ### 现象
   （错误信息、异常行为）

   ### 分析
   （可能的原因）

   ### 用户反馈
   （用户提供的额外信息）

   ### 后续
   （待确认或待解决）
   ```

2. 回到 Step 1，告诉 AI：
   ```
   阅读 debug.md，继续分析问题
   ```

---

## 相关 Skills

### vibe-coding skill

**位置**: `/Applications/workspace/ailab/research/claw/openclaw/skills/vibe-coding/SKILL.md`

**用途**: 定义协作式编程工作流的规范

**核心规则**：
- 方案必须写入 prompt.md，不能直接修改代码
- prompt.md 结尾必须包含收尾工作清单
- prompt.md 必须包含测试验证步骤（功能测试、边界测试、回归测试）
- debug.md 只记录未解决的问题
- 自动读取 debug.md，不询问

---

## OpenClaw 配置修改

为了让 OpenClaw 自动遵守 vibe-coding 规范，需要修改 `SOUL.md`：

### 修改内容

**文件**: `~/.openclaw/workspace/SOUL.md`

**添加内容**:

```markdown
## Coding

When discussing project, please use the vibe-coding skill.

**重要**：涉及 vibe coding、修改代码、调试反馈、方案设计时，必须先阅读 `/Applications/workspace/ailab/research/claw/openclaw/skills/vibe-coding/SKILL.md` 并严格遵守其规范：

- **自动读取** `README.md` 和 `debug.md`（不询问，直接读）
- 方案写入 `prompt.md`，包含：问题描述、根因分析、解决方案、修改步骤、测试验证、验收标准、收尾工作
- 方案执行后确认 README 更新、git commit、push
```

### 为什么修改 SOUL.md

`SOUL.md` 是 OpenClaw 的"人格定义"文件，每次 session 启动时都会读取。通过在这里添加 vibe-coding 规范，可以确保：

1. **自动化**：不需要每次提醒 AI 遵守规范
2. **一致性**：所有讨论都遵循相同的工作流
3. **可传承**：其他同学使用同一套 workspace 配置即可获得相同体验

---

## 调试工具

### 浏览器测试

项目有 Web UI 时，AI 会使用浏览器工具访问并测试：
- 打开 `http://localhost:3000/` 等地址
- 检查页面渲染、交互功能
- 发现 UI 相关 bug

### ttyd 调试终端

用户会启动 `ttyd --writable bash` 在 `http://localhost:7681/` 提供可交互终端。

AI 可以：
1. 用浏览器打开 `http://localhost:7681/`
2. 读取终端内容、执行命令
3. 结合本地代码分析问题
4. 将发现的 bug 写入 `debug.md`

---

## 文件约定

### 项目根目录文件

| 文件 | 用途 | 状态 |
|------|------|------|
| `README.md` | 项目说明文档 | AI 阅读理解项目 |
| `prompt.md` | 方案文档 | AI 输出，Claude Code 执行 |
| `debug.md` | 调试日志 | 记录未解决问题 |

### OpenClaw Workspace 文件

| 文件 | 用途 |
|------|------|
| `~/.openclaw/workspace/SOUL.md` | AI 人格定义 |
| `~/.openclaw/workspace/AGENTS.md` | 工作区行为规则 |
| `~/.openclaw/workspace/USER.md` | 用户信息 |

---

## 完整示例

### 场景：修复文件上传失败

**1. 在 OpenClaw 中发起讨论**：

```
阅读 README.md 理解项目、阅读 debug.md 分析问题；将解决方案放在 prompt.md 里面
```

**2. AI 自动执行**：

OpenClaw 会自动：
1. 读取 `README.md` 理解项目背景
2. 读取 `debug.md` 获取调试信息（如有）
3. 使用浏览器/ttyd 终端进行实时调试（如需要）
4. 按照 vibe-coding skill 规范，将方案写入 `prompt.md`

**不询问，直接读取**，减少对话轮次。

### 调试工具

**浏览器测试**：
- 访问 `http://localhost:3000/` 等 Web UI
- 检查页面渲染、交互功能
- 发现 UI 相关 bug

**ttyd 调试终端**：
- 用户启动：`ttyd --writable bash`
- 访问：`http://localhost:7681/`
- 用途：查看服务状态、执行命令、检查日志、测试 API

```markdown
# 修复文件上传失败

## 问题描述
上传文件时出现 ENOENT 错误...

## 根因分析
1. Job 目录不存在
2. 缺少目录创建逻辑...

## 解决方案
在 saveToInputs 函数中添加目录创建...

## 修改步骤
### Step 1: 修改 src/job/manager.ts
```typescript
// 完整代码片段
```

## 验收标准
- [ ] 上传文件不再报错

## 收尾工作
- [ ] 修改相关代码文件
- [ ] 更新 README.md
- [ ] 提交 git commit
- [ ] push 到远程仓库
```

**4. 执行 Claude Code**：

```bash
claude
```

**5. 验证结果**：
- 成功 → 执行测试验证 → 更新 README，清理 debug.md
- 失败 → 写入 debug.md，回到 Step 1

---

## 测试验证要求

prompt.md 中必须包含测试验证部分：

```markdown
## 测试验证

修改完成后，**必须**进行以下测试：

1. **功能测试**：
   - [ ] 测试步骤 1
   - [ ] 测试步骤 2

2. **边界测试**：
   - [ ] 测试异常输入
   - [ ] 测试极端情况

3. **回归测试**：
   - [ ] 确认相关功能未受影响
```

测试未通过时，将问题记录到 `debug.md` 继续迭代。

---

## 最佳实践

### 对 AI 的提示词

| 场景 | 提示词 |
|------|--------|
| 开始新任务 | `阅读 README.md，将解决方案写入 prompt.md` |
| 继续调试 | `阅读 debug.md，继续分析问题` |
| 多方案选择 | `列出所有可行方案，推荐一个并说明理由` |
| 验收确认 | `方案执行完成，帮我检查收尾工作是否完成` |

### 常见问题

**Q: prompt.md 内容太长怎么办？**

A: 复杂方案建议分阶段执行，每阶段一个 prompt.md。在文件名中标注阶段，如 `prompt_phase1.md`。

**Q: debug.md 要保留多久？**

A: 只保留未解决的问题。问题解决后删除对应条目，或标记为 `[已解决]`。

**Q: 多人协作时如何共享？**

A: 将 prompt.md 和 debug.md 纳入 git 版本控制。SOUL.md 配置可以通过共享 workspace 目录同步。

---

## 快速开始 Checklist

新同学接入此工作流：

- [ ] 克隆项目仓库
- [ ] 确认项目根目录有 `README.md`
- [ ] 创建空的 `prompt.md` 和 `debug.md`
- [ ] 配置 OpenClaw workspace：
  - [ ] 修改 `~/.openclaw/workspace/SOUL.md` 添加 vibe-coding 规范
- [ ] 安装并配置 Claude Code
- [ ] 开始第一次讨论！

---

## 相关资源

- **vibe-coding skill**: `/Applications/workspace/ailab/research/claw/openclaw/skills/vibe-coding/SKILL.md`
- **OpenClaw 文档**: https://docs.openclaw.ai
- **Claude Code**: https://claude.ai/code

---

*最后更新：2026-03-23*
