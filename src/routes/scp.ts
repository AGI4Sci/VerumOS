/**
 * SCP Tools API Routes - SCP 工具 API 路由
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from '../config.js';

const app = new Hono();

/**
 * 列出可用的 SCP 工具
 */
app.get('/', async (c) => {
  const tools = [
    {
      id: 'DrugSDA-Tool',
      name: 'DrugSDA-Tool',
      category: 'drug_discovery',
      provider: '北京大学',
      toolCount: 28600,
      type: '数据库/计算工具',
      description: '药物分子筛选、设计与分析工具集',
      usage: '使用方法：\n1. 输入分子结构（SMILES 格式或上传 SDF 文件）\n2. 选择分析类型（格式转换、相似度计算、分子对接等）\n3. 设置参数阈值\n4. 运行并查看结果',
      tags: ['分子筛选', '药物设计', '格式转换'],
    },
    {
      id: 'DrugSDA-Model',
      name: 'DrugSDA-Model',
      category: 'drug_discovery',
      provider: '北京大学',
      toolCount: 1700,
      type: '模型服务',
      description: '分子对接、结合口袋识别、亲和力预测、ADMET评估',
      usage: '使用方法：\n1. 准备配体分子和受体蛋白\n2. 选择预测任务\n3. 上传或指定分子文件\n4. 获取预测结果',
      tags: ['分子对接', 'ADMET', '亲和力预测'],
    },
    {
      id: 'VenusFactory',
      name: 'VenusFactory',
      category: 'protein_engineering',
      provider: '上海交通大学',
      toolCount: 1500,
      type: '数据库/计算工具/模型服务',
      description: '蛋白质工程 AI 全流程工具',
      usage: '使用方法：\n1. 输入蛋白质序列（FASTA 格式）\n2. 选择预测任务\n3. 设置突变位点或全序列扫描\n4. 查看预测结果和可视化',
      tags: ['蛋白质设计', '突变预测', '功能预测'],
    },
    {
      id: 'BioInfo-Tools',
      name: 'BioInfo-Tools',
      category: 'protein_engineering',
      provider: '上海人工智能实验室',
      toolCount: 55,
      type: '数据库/计算工具/模型服务',
      description: '蛋白质序列分析工具',
      usage: '使用方法：\n1. 输入蛋白质序列\n2. 选择分析工具\n3. 设置 E-value 阈值和数据库\n4. 获取注释结果',
      tags: ['序列分析', '结构域识别', 'GO注释'],
    },
    {
      id: 'Origene-UniProt',
      name: 'Origene-UniProt',
      category: 'protein_engineering',
      provider: '临港实验室',
      toolCount: 121,
      type: '数据库',
      description: 'UniProt 蛋白质数据库检索',
      usage: '使用方法：\n1. 输入蛋白质名称、基因名或 UniProt ID\n2. 选择检索范围\n3. 查看序列、功能注释等信息',
      tags: ['UniProt', '蛋白质数据库', '功能注释'],
    },
    {
      id: 'Origene-TCGA',
      name: 'Origene-TCGA',
      category: 'genomics',
      provider: '临港实验室',
      toolCount: 8,
      type: '数据库',
      description: 'TCGA 癌症基因组数据库检索',
      usage: '使用方法：\n1. 选择癌症类型\n2. 输入基因名或样本 ID\n3. 查看表达、突变、生存分析等数据',
      tags: ['TCGA', '癌症基因组', '表达谱'],
    },
    {
      id: 'Origene-KEGG',
      name: 'Origene-KEGG',
      category: 'pathway',
      provider: '临港实验室',
      toolCount: 10,
      type: '数据库',
      description: 'KEGG 通路数据库检索',
      usage: '使用方法：\n1. 输入基因或通路名称\n2. 查看代谢通路、信号通路图\n3. 分析基因在通路中的位置和功能',
      tags: ['KEGG', '代谢通路', '信号通路'],
    },
    {
      id: 'SciGraph',
      name: 'SciGraph',
      category: 'knowledge_graph',
      provider: '上海人工智能实验室',
      toolCount: 4800,
      type: '数据库',
      description: '科学研究统一知识查询服务',
      usage: '使用方法：\n1. 输入科学实体或概念\n2. 查询跨学科知识关联\n3. 探索知识图谱网络',
      tags: ['跨学科', '知识图谱', '科学查询'],
    },
    {
      id: 'Thoth',
      name: 'Thoth',
      category: 'wetlab',
      provider: '上海人工智能实验室',
      toolCount: 1300,
      type: '湿实验操作/模型服务',
      description: '湿实验智能编排系统',
      usage: '使用方法：\n1. 描述实验目标\n2. Thoth-Plan 自动生成实验流程\n3. Thoth-OP 执行原子操作并记录结果',
      tags: ['实验编排', '自动化', '实验记录'],
    },
  ];

  return c.json({
    ok: true,
    tools,
    total: tools.length,
  });
});

/**
 * 调用 SCP 工具
 */
app.post('/invoke', async (c) => {
  try {
    const body = await c.req.json();
    const { tool_id, action, parameters } = body;

    if (!tool_id || !action) {
      return c.json({
        ok: false,
        error: 'Missing required fields: tool_id, action',
      }, 400);
    }

    const { apiKey, baseUrl } = config.scp;

    if (!apiKey) {
      return c.json({
        ok: false,
        error: 'SCP_API_KEY not configured. Please set SCP_API_KEY in .env file.',
      }, 500);
    }

    console.log(`[SCP API] Invoking ${tool_id}.${action}`);
    console.log(`[SCP API] Parameters:`, parameters);

    // 调用 SCP Hub API
    const response = await fetch(`${baseUrl}/api/v1/tools/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        tool_id,
        action,
        parameters: parameters || {},
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SCP API] Error (${response.status}):`, errorText);
      return c.json({
        ok: false,
        error: `SCP API error (${response.status}): ${errorText}`,
      }, response.status);
    }

    const data = await response.json();
    console.log(`[SCP API] Success:`, data);

    return c.json({
      ok: true,
      result: data.result || data,
      metadata: data.metadata,
    });
  } catch (error) {
    console.error('[SCP API] Error:', error);
    return c.json({
      ok: false,
      error: `Failed to invoke SCP tool: ${error instanceof Error ? error.message : String(error)}`,
    }, 500);
  }
});

/**
 * 测试 SCP API 连接
 */
app.get('/test', async (c) => {
  const { apiKey, baseUrl } = config.scp;

  if (!apiKey) {
    return c.json({
      ok: false,
      error: 'SCP_API_KEY not configured',
      configured: false,
    });
  }

  try {
    // 尝试调用一个简单的工具来测试连接
    const response = await fetch(`${baseUrl}/api/v1/tools/list`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return c.json({
        ok: true,
        configured: true,
        baseUrl,
        message: 'SCP API connection successful',
      });
    } else {
      return c.json({
        ok: false,
        configured: true,
        error: `Connection failed with status ${response.status}`,
      });
    }
  } catch (error) {
    return c.json({
      ok: false,
      configured: true,
      error: `Failed to connect to SCP API: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
});

export default app;
