/**
 * Model Agent Definition - 模型代理定义
 *
 * 职责：
 * - 机器学习建模
 * - 模型训练和推理
 *
 * 当前状态：占位实现，提示用户功能开发中
 */

import type { AgentDef } from '../core/types.js';

/**
 * Model Agent 配置
 *
 * 注意：此 Agent 当前为占位实现
 */
export const ModelAgentDef: AgentDef = {
  id: 'model-agent',
  name: 'Model Agent',
  description: '负责机器学习建模、模型训练和推理。处理模型选择、超参数调优、训练监控等任务。',

  systemPrompt: `你是 Model Agent，专注于机器学习建模任务。

## 当前状态

⚠️ **此功能正在开发中**

暂时无法提供模型训练、推理等服务。请告知用户此功能正在开发中，建议他们：
1. 使用 Data Agent 进行数据预处理
2. 等待后续版本更新

## 未来能力（规划中）

- 模型选择与推荐
- 超参数调优
- 训练监控
- 模型评估
- 推理部署
`,

  skills: [],  // 暂无 skills

  routes: [
    {
      match: {
        pattern: /训练|模型|预测|机器学习|ML|深度学习|神经网络|分类|回归|聚类/i,
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
