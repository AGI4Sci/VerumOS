# VerumOS - Analysis Agent 工具池集成方案

## 问题描述

用户要求开发 Analysis Agent，并接入 SCP Hub 的所有工具。当前状态：
- 前端已有工具池 UI，但只包含 25 个服务
- tool.md 中实际有 **40 个服务、2302 个工具**
- Analysis Agent 是占位实现，缺少实际功能
- 工具缺少详细的使用说明
- 后端缺少工具调用集成

## 根因分析

1. **工具数据不完整**：前端 `SCP_TOOLS` 数组只包含 25 个服务，遗漏了 15 个服务
2. **缺少使用说明**：每个工具只有简要描述，缺少详细的使用方法和参数说明
3. **Analysis Agent 未实现**：只是占位代码，缺少实际的分析逻辑和工具调用能力
4. **前后端未打通**：前端选择工具后，后端没有对应的工具注册和执行逻辑

## 解决方案

### 方案一：完整工具数据 + 使用说明（推荐）

**优点**：
- 提供完整的 40 个服务信息
- 每个工具有详细使用说明
- 用户可以快速了解工具能力
- 为后续工具调用打好基础

**缺点**：
- 工作量较大，需要手动整理 40 个服务的详细信息
- 前端需要展示更多信息

### 方案二：最小化实现

**优点**：
- 快速上线
- 只实现核心功能

**缺点**：
- 用户无法了解完整工具能力
- 后续需要补全数据

## 推荐方案：方案一

理由：
1. 工具池是核心功能，应该一次性做完整
2. 使用说明对用户理解工具非常重要
3. 为后续工具调用集成打好基础

## 修改步骤

### 1. 补全 SCP 工具数据（前端）

**文件**：`web/index.html`

**修改内容**：
- 从 tool.md 提取所有 40 个服务的信息
- 为每个工具添加详细的使用说明（usage 字段）
- 更新 `SCP_TOOLS` 数组

**数据结构**：
```javascript
const SCP_TOOLS = [
  {
    id: 'DrugSDA-Tool',
    name: 'DrugSDA-Tool',
    provider: '北京大学',
    toolCount: 28600,
    type: '数据库/计算工具',
    category: '药物研发',
    description: '药物分子筛选、设计与分析工具集',
    usage: '使用方法：\n1. 上传分子结构文件（支持 SMILES、SDF、PDB 格式）\n2. 选择分析类型（相似度计算、分子对接、ADMET 预测等）\n3. 设置参数并运行\n4. 查看分析结果',
    tags: ['分子筛选', '药物设计', 'ADMET'],
    inputFormats: ['SMILES', 'SDF', 'PDB'],
    outputFormats: ['CSV', 'JSON', 'SDF']
  },
  // ... 其他 39 个服务
];
```

### 2. 增强工具池 UI（前端）

**文件**：`web/index.html`

**修改内容**：
- 添加"查看详情"按钮，展开工具使用说明
- 支持按标签过滤
- 显示输入/输出格式
- 添加工具状态指示（已集成/待集成）

**UI 改进**：
```html
<div class="tool-card">
  <!-- 现有内容 -->
  <div class="tool-actions">
    <button class="tool-detail-btn" onclick="showToolDetail('${tool.id}')">查看详情</button>
  </div>
</div>

<!-- 详情弹窗 -->
<div class="tool-detail-modal">
  <div class="detail-section">
    <h4>使用方法</h4>
    <pre>${tool.usage}</pre>
  </div>
  <div class="detail-section">
    <h4>输入格式</h4>
    <div class="format-tags">
      ${tool.inputFormats.map(f => `<span class="format-tag">${f}</span>`).join('')}
    </div>
  </div>
  <!-- ... -->
</div>
```

### 3. 完善 Analysis Agent（后端）

**文件**：`src/agents/analysis-agent.ts`

**修改内容**：
- 实现真实分析能力
- 集成 SCP 工具调用
- 支持多种分析类型

**代码结构**：
```typescript
export const AnalysisAgentDef: AgentDef = {
  id: 'analysis-agent',
  name: 'Analysis Agent',
  description: '负责统计分析、可视化、科研工具集成',
  
  systemPrompt: `你是 Analysis Agent，负责：
1. 统计分析（描述性统计、假设检验、相关性分析）
2. 可视化图表生成（折线图、柱状图、散点图、热力图等）
3. 调用 SCP Hub 的科研工具

## 可用工具

你拥有以下 SCP Hub 工具：
- DrugSDA-Tool: 药物分子筛选与设计
- VenusFactory: 蛋白质工程 AI 工具
- SciGraph: 科学知识查询
... （列出所有 40 个服务）

根据用户需求，选择合适的工具并执行分析。`,

  skills: ['csv-skill', 'bioinfo-skill'],  // 复用现有 skills
  
  tools: [
    // 定义分析相关工具
    createStatisticalAnalysisTool(),
    createVisualizationTool(),
    createSCPToolInvoker(),
  ],

  routes: [
    {
      match: {
        pattern: /分析|可视化|图表|统计|绘图|scp|drug|protein/i,
      },
      priority: 10,
    },
  ],
  
  memoryPolicy: createDefaultMemoryPolicy(),
};
```

### 4. 实现 SCP 工具调用器（后端）

**新文件**：`src/tools/scp-tool-invoker.ts`

**职责**：
- 调用 SCP Hub API
- 处理工具输入输出
- 错误处理和重试

**代码框架**：
```typescript
export function createSCPToolInvoker(): ToolDef {
  return {
    name: 'invoke_scp_tool',
    description: '调用 SCP Hub 科研工具',
    parameters: {
      type: 'object',
      properties: {
        toolId: { type: 'string', description: '工具 ID' },
        action: { type: 'string', description: '操作类型' },
        params: { type: 'object', description: '工具参数' },
      },
      required: ['toolId', 'action', 'params'],
    },
    execute: async (params, ctx) => {
      const { toolId, action, params: toolParams } = params;
      
      // 1. 验证工具是否可用
      // 2. 调用 SCP API
      // 3. 处理响应
      // 4. 返回结果
      
      return {
        success: true,
        result: '...',
      };
    },
  };
}
```

### 5. 创建工具注册 API（后端）

**新文件**：`src/routes/tools.ts`

**API 端点**：
- `GET /api/tools` - 获取所有可用工具
- `POST /api/tools/activate` - 激活工具
- `POST /api/tools/deactivate` - 停用工具
- `POST /api/tools/invoke` - 调用工具

**代码框架**：
```typescript
import { Hono } from 'hono';

const app = new Hono();

// 获取工具列表
app.get('/', (c) => {
  const tools = toolRegistry.getAllTools();
  return c.json({ tools });
});

// 激活工具
app.post('/activate', async (c) => {
  const { toolIds } = await c.req.json();
  // 注册工具到 ToolRegistry
  return c.json({ success: true });
});

// 调用工具
app.post('/invoke', async (c) => {
  const { toolId, action, params } = await c.req.json();
  const result = await toolRegistry.execute({ name: toolId, arguments: params }, ctx);
  return c.json(result);
});

export default app;
```

### 6. 数据持久化（后端）

**修改文件**：`src/job/types.ts`

**添加字段**：
```typescript
export interface JobState {
  // ... 现有字段
  activeTools?: string[];  // 激活的工具 ID 列表
  toolConfigurations?: Record<string, any>;  // 工具配置
}
```

## 测试验证

修改完成后，**必须**进行以下测试：

### 1. 功能测试

- [ ] 工具池显示所有 40 个服务
- [ ] 分类过滤正常工作
- [ ] 搜索功能正常
- [ ] 批量选择/取消功能正常
- [ ] 工具详情展示正确
- [ ] 工具激活/停用状态持久化
- [ ] Analysis Agent 能正确调用工具

### 2. 边界测试

- [ ] 搜索无结果时的提示
- [ ] 大量工具选择时的性能
- [ ] 网络异常时的错误处理
- [ ] 无效工具 ID 的处理

### 3. 回归测试

- [ ] 现有 Data Agent 功能正常
- [ ] 文件上传功能正常
- [ ] 需求文档功能正常
- [ ] Job Workspace 功能正常

**测试方法**：
```bash
# 启动服务
pnpm dev

# 打开浏览器
# http://localhost:3000/

# 执行测试步骤：
# 1. 点击侧边栏"工具池"标签
# 2. 验证 40 个服务都显示
# 3. 测试分类过滤
# 4. 测试搜索功能
# 5. 测试批量选择
# 6. 查看工具详情
# 7. 激活工具
# 8. 在聊天中调用 Analysis Agent
# 9. 测试工具调用
```

## 收尾工作

- [ ] 修改相关代码文件（前端 + 后端）
- [ ] 执行测试验证（必须）
- [ ] 更新 README.md 添加工具池功能说明
- [ ] 更新 API 文档
- [ ] 提交 git commit，message: `feat: 完善 Analysis Agent 工具池集成`
- [ ] push 到远程仓库

## 数据清单

需要补全的 40 个服务（从 tool.md 提取）：

### 🧬 药物研发 (3)
1. DrugSDA-Tool - 北京大学 - 28,600 工具
2. DrugSDA-Model - 北京大学 - 1,700 工具
3. Origene-FDADrug - 临港实验室 - 57 工具

### 🧪 蛋白质工程 (4)
4. VenusFactory - 上海交通大学 - 1,500 工具
5. BioInfo-Tools - 上海人工智能实验室 - 55 工具
6. Origene-UniProt - 临港实验室 - 121 工具
7. Origene-STRING - 临港实验室 - 6 工具

### 🧫 基因组学 (4)
8. Origene-Ensembl - 临港实验室 - 14 工具
9. Origene-UCSC - 临港实验室 - 12 工具
10. Origene-NCBI - 临港实验室 - 9 工具
11. Origene-TCGA - 临港实验室 - 8 工具

### 🔬 疾病与靶点 (2)
12. Origene-OpenTargets - 临港实验室 - 189 工具
13. Origene-Monarch - 临港实验室 - 49 工具

### ⚗️ 化学与分子 (3)
14. Origene-ChEMBL - 临港实验室 - 47 工具
15. Origene-PubChem - 临港实验室 - 306 工具
16. Origene-KEGG - 临港实验室 - 10 工具

### ⚗️ 化学计算 (2)
17. SciToolAgent-Chem - 浙江大学 - 505 工具
18. 化学与反应计算 - 上海人工智能实验室 - 276 工具

### 🧪 湿实验操作 (1)
19. Thoth - 上海人工智能实验室 - 1,300+ 工具

### 🔍 综合工具 (3)
20. SciToolAgent-Bio - 浙江大学 - 40 工具
21. SciGraph-Bio - 上海人工智能实验室 - 56 工具
22. Origene-Search - 临港实验室 - 6 工具

### 🌐 通用工具 (3)
23. SciGraph - 上海人工智能实验室 - 4,800 工具
24. ToolUniverse - 上海人工智能实验室 - 236 工具
25. 数据处理与统计分析 - 上海人工智能实验室 - 320 工具

**注意**：当前前端已有 25 个服务，需要补充缺失的 15 个服务。

## 实施优先级

1. **P0（必须）**：补全工具数据、完善工具池 UI
2. **P1（重要）**：实现 Analysis Agent 基本功能
3. **P2（后续）**：实现 SCP 工具实际调用、工具配置管理
