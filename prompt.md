# 修复 Data Agent 执行按钮无响应问题

## 问题描述

用户在前端填写需求文档后，点击"执行"按钮，系统没有执行分析方案，而是返回"请告诉我您的分析需求"。

## 根因分析

### 问题 1：意图匹配顺序错误

在 `data-agent.ts` 的 `heuristicIntent` 方法中，意图规则按声明顺序匹配：

```javascript
const DATA_AGENT_INTENT_RULES: IntentRule[] = [
  // ...
  {
    intent: 'requirement' as IntentType,
    patterns: [/需求|目标|想做|分析方案/i],  // <-- 包含 "分析方案"
    confidence: 0.9,
  },
  {
    intent: 'execute' as IntentType,
    patterns: [/执行|开始|run|execute|确认执行/i],  // <-- 包含 "执行"
    confidence: 0.85,
  },
];
```

用户消息 "执行需求文档中的分析方案" 同时匹配两个模式：
- `/执行/` 匹配 → execute 意图
- `/分析方案/` 匹配 → requirement 意图

由于 `requirement` 规则在数组前面，消息被错误识别为 `requirement` 意图！

### 问题 2：需求文档数据源解析失败

用户在前端填写的 Markdown 内容：
```markdown
# 需求文档
## 数据源
| 文件 | 类型 | 描述 |
|------|------|------|
| count_matrix.csv | 表达矩阵 | gene × cell |
## 目标
细胞类型鉴定
## 分析方案
1. 加载表达矩阵
2. QC 过滤
3. 标准化
```

但保存后的 `datasets: []` 为空。

原因：`parseMarkdownToDocument` 中的正则匹配：
```javascript
const dataSection = markdown.match(/##\s*数据\s*\n([\s\S]*?)(?=\n##|$)/i);
```

匹配的是 `## 数据`，但用户写的是 `## 数据源`！正则没有匹配到。

### 问题 3：前端缺少执行状态反馈

点击执行按钮后，用户看不到任何进度信息，不知道系统在做什么。

## 解决方案

### 修复 1：调整意图匹配优先级

在 `heuristicIntent` 方法中，当消息同时匹配多个意图时，应该选择更具体的意图。

修改 `src/agents/data-agent.ts`：

```typescript
private heuristicIntent(message: string, context: ConversationContext): Intent {
  const hasDataset = context.datasets.size > 0;
  const matches: { intent: IntentType; confidence: number }[] = [];

  // 收集所有匹配的意图
  for (const rule of DATA_AGENT_INTENT_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(message)) {
        matches.push({
          intent: rule.intent as IntentType,
          confidence: rule.confidence ?? 0.9,
        });
        break; // 每个规则只匹配一次
      }
    }
  }

  // 如果有多个匹配，按优先级选择
  if (matches.length > 0) {
    // 定义意图优先级（数字越大优先级越高）
    const priority: Record<string, number> = {
      'execute': 100,    // 执行是最高优先级
      'upload': 90,
      'explore': 80,
      'merge': 70,
      'transform': 60,
      'question': 50,
      'requirement': 40, // requirement 优先级较低
    };

    // 按优先级排序，选择最高的
    matches.sort((a, b) => (priority[b.intent] ?? 0) - (priority[a.intent] ?? 0));
    return {
      type: matches[0].intent,
      confidence: matches[0].confidence,
      datasetId: context.activeDatasetId,
    };
  }

  // 如果有数据集但没有匹配到具体意图，默认为 question
  if (hasDataset) {
    return {
      type: 'question',
      confidence: 0.75,
      datasetId: context.activeDatasetId,
    };
  }

  return { type: 'unknown', confidence: 0.4 };
}
```

### 修复 2：改进需求文档解析

修改 `src/agents/requirement-doc.ts` 的 `parseMarkdownToDocument` 函数：

```typescript
export function parseMarkdownToDocument(markdown: string): Partial<RequirementDocument> {
  const result: Partial<RequirementDocument> = {
    content: markdown,
  };

  // 解析标题
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    result.title = titleMatch[1];
  }

  // 解析数据源表格 - 改进正则以支持 "数据源" 或 "数据"
  const dataSection = markdown.match(/##\s*数据[源]?\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (dataSection) {
    // 优先解析表格格式
    const tableRows = dataSection[1].match(/\|.+\|/g);
    if (tableRows && tableRows.length > 2) {
      const tableDatasets = tableRows.slice(2).map((row) => {
        const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
        return {
          file: cells[0] || '',
          type: cells[1] || '',
          description: cells[2] || '',
        };
      }).filter(d => d.file && !d.file.startsWith('-') && d.file !== '');
      
      if (tableDatasets.length > 0) {
        result.datasets = tableDatasets;
      }
    }

    // 如果表格解析失败，尝试提取文件名
    if (!result.datasets || result.datasets.length === 0) {
      const fileMatches = dataSection[1].matchAll(/([a-zA-Z0-9_\-./]+\.(?:csv|tsv|xlsx|xls))/gi);
      const datasets: DatasetInfo[] = [];
      for (const match of fileMatches) {
        datasets.push({
          file: match[1],
          type: 'data file',
          description: '',
        });
      }
      if (datasets.length > 0) {
        result.datasets = datasets;
      }
    }
  }

  // 解析目标 - 改进匹配
  const goalSection = markdown.match(/##\s*目标\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (goalSection) {
    const goals = goalSection[1]
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => line.replace(/^[-*]\s*/, '').replace(/^\*\*核心\*\*[：:]\s*/, '').trim())
      .filter(Boolean);
    result.goals = goals;
  }

  // 解析分析方案
  const planSection = markdown.match(/##\s*分析方案\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (planSection) {
    const steps = planSection[1]
      .split('\n')
      .filter((line) => /^\s*[-*]\s*/.test(line) || /^\s*\d+\./.test(line))
      .map((line, index) => ({
        step: index + 1,
        description: line.replace(/^\s*[-*]\s*/, '').replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').trim(),
        status: 'pending' as const,
      }));
    result.analysisPlan = steps;
  }

  // 解析状态
  const statusMatch = markdown.match(/\*\*状态\*\*[：:]\s*(.+)/i);
  if (statusMatch) {
    const statusText = statusMatch[1].toLowerCase();
    if (statusText.includes('完成')) {
      result.status = 'completed';
    } else if (statusText.includes('执行中')) {
      result.status = 'executing';
    } else if (statusText.includes('确认') || statusText.includes('confirmed')) {
      result.status = 'confirmed';
    } else if (statusText.includes('讨论')) {
      result.status = 'discussing';
    } else {
      result.status = 'draft';
    }
  }

  return result;
}
```

### 修复 3：前端添加执行状态反馈

修改 `web/index.html` 的 `executeRequirement` 函数，添加执行进度显示：

```javascript
async function executeRequirement() {
  // 先保存
  await saveRequirement();
  
  // 检查是否有当前 Job
  if (!currentJobId) {
    addMessage('system', '请先选择或创建一个任务');
    return;
  }
  
  // 更新状态为已确认
  updateRequirementStatus('confirmed');
  addMessage('system', '🚀 开始执行分析方案...');
  
  // 添加进度消息元素
  const progressId = 'progress-' + Date.now();
  addMessage('system', '⏳ 正在准备执行环境...');
  
  try {
    // 发送执行命令
    const input = document.getElementById('input');
    input.value = '执行需求文档中的分析方案';
    await sendMessage();
  } catch (error) {
    addMessage('system', `❌ 执行失败：${error.message}`);
  }
}
```

### 修复 4：后端添加执行日志

修改 `src/agents/data-agent.ts` 的 `handleExecute` 方法，添加详细日志：

```typescript
private async handleExecute(context: ConversationContext): Promise<AgentResponse> {
  const doc = await getRequirementDocument(context.sessionId);

  if (!doc) {
    return {
      type: 'text',
      content: '请先创建需求文档。您可以描述您的分析需求来开始。',
    };
  }

  logger.info(`[handleExecute] Starting execution for session ${context.sessionId}`);
  logger.info(`[handleExecute] Document status: ${doc.status}, datasets: ${doc.datasets.length}`);

  // 如果状态不是 confirmed，先更新为 confirmed
  if (doc.status !== 'confirmed' && doc.status !== 'executing') {
    await updateRequirementDocument(context.sessionId, { status: 'confirmed' });
    doc.status = 'confirmed';
  }

  const toolChain = generateToolChain(doc);
  logger.info(`[handleExecute] Generated toolchain with ${toolChain.length} steps`);
  
  if (toolChain.length === 0) {
    return {
      type: 'text',
      content: '未找到可执行的工具链。请在需求文档中配置数据源。\n\n提示：确保"数据源"部分包含文件名（如 count_matrix.csv）。',
    };
  }

  // ... 其余代码保持不变
}
```

## 修改步骤

1. **修改 `src/agents/data-agent.ts`**:
   - 替换 `heuristicIntent` 方法，添加意图优先级逻辑
   - 在 `handleExecute` 方法开头添加日志

2. **修改 `src/agents/requirement-doc.ts`**:
   - 修改 `parseMarkdownToDocument` 中的数据源正则为 `/##\s*数据[源]?\s*\n/`

3. **修改 `web/index.html`**:
   - 在 `executeRequirement` 函数中添加进度消息

## 测试验证

修改完成后，**必须**进行以下测试：

### 1. 功能测试
- [ ] 在需求文档编辑器中填写包含数据源表格的内容
- [ ] 点击保存，确认数据源被正确解析（检查 API 响应）
- [ ] 点击执行按钮
- [ ] 验证系统显示"开始执行分析方案..."
- [ ] 验证工具链被正确执行
- [ ] 验证输出文件生成到 outputs 目录

### 2. 边界测试
- [ ] 需求文档为空时点击执行，应提示"请先创建需求文档"
- [ ] 需求文档没有数据源时点击执行，应提示"未找到可执行的工具链"
- [ ] 消息"我想讨论分析方案"应识别为 requirement 意图
- [ ] 消息"执行分析方案"应识别为 execute 意图

### 3. 回归测试
- [ ] 上传文件功能正常
- [ ] 数据探索功能正常
- [ ] 需求讨论功能正常
- [ ] 控制台无报错

### 测试方法
- 启动服务：`pnpm dev`
- 打开浏览器：`http://localhost:3000/`
- 执行上述测试步骤
- 如发现问题，记录到 debug.md

## 收尾工作

- [ ] 修改相关代码文件
- [ ] 执行测试验证（必须）
- [ ] 更新 README.md 使项目状态与描述一致
- [ ] 提交 git commit，message 格式：`fix: Data Agent 执行按钮意图匹配和数据源解析问题`
- [ ] push 到远程仓库
