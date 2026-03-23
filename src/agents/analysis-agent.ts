/**
 * Analysis Agent Definition - 分析代理定义
 *
 * 职责：
 * - 统计分析
 * - 可视化图表生成
 *
 * 当前状态：占位实现，提示用户功能开发中
 */

import type { AgentDef } from '../core/types.js';

/**
 * Analysis Agent 配置
 *
 * 注意：此 Agent 当前为占位实现
 */
export const AnalysisAgentDef: AgentDef = {
  id: 'analysis-agent',
  name: 'Analysis Agent',
  description: '负责统计分析、可视化图表生成。处理数据统计、假设检验、图表绑制等任务。',

  systemPrompt: `你是 Analysis Agent，专注于统计分析和可视化任务。

## 当前状态

⚠️ **此功能正在开发中**

暂时无法提供统计分析、可视化等服务。请告知用户此功能正在开发中，建议他们：
1. 使用 Data Agent 进行数据探索
2. 手动使用 Python (matplotlib/seaborn) 绑制图表
3. 等待后续版本更新

## 未来能力（规划中）

- 描述性统计
- 假设检验
- 相关性分析
- 可视化图表（折线图、柱状图、散点图、热力图等）
- 交互式图表
`,

  skills: [],  // 暂无 skills

  routes: [
    {
      match: {
        pattern: /分析|可视化|图表|统计|绑图|画图|折线|柱状|散点|热力|假设检验/i,
      },
      priority: 10,
    },
  ],

  memoryPolicy: {
    workingMemory: {
      maxMessages: 50,
      maxTokens: 40000,
    },
    jobMemory: {
      includeDatasetMeta: true,
      includeRequirementDoc: true,
      includeRecentTraces: 5,
    },
    longTermMemory: {
      enabled: false,
    },
  },
};
