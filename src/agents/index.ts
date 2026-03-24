import type { Agent } from './types.js';
import {
  dataAgent,
  dataAgentMeta,
  dataAgentProcessor,
  createDataAgentConfig,
} from './data-agent.js';
import { ModelAgentDef } from './model-agent.js';
import { AnalysisAgentDef } from './analysis-agent.js';
import { AgentRegistry as NewAgentRegistry } from '../registry/agent-registry.js';
import { getCoreServices } from '../app.js';
import type { ToolContext } from '../core/types.js';

/**
 * 创建空的工具上下文（用于公开 API 工具调用）
 */
function createEmptyToolContext(): ToolContext {
  return {
    jobId: '',
    sessionId: '',
    datasets: new Map(),
  };
}

/**
 * 从消息中提取 UniProt ID
 */
function extractUniProtId(message: string): string | null {
  // 匹配格式: P04637, Q9Y6K9 等 UniProt ID
  const match = message.match(/[OPQ][0-9][A-Z0-9]{3}[0-9]/i);
  return match ? match[0].toUpperCase() : null;
}

/**
 * 从消息中提取基因名
 */
function extractGeneName(message: string): string | null {
  // 常见基因名模式
  const patterns = [
    /基因[：:]\s*([A-Za-z0-9-]+)/i,
    /gene[：:]\s*([A-Za-z0-9-]+)/i,
    /查询\s*([A-Z][A-Z0-9-]*)/i,
    /search\s+([A-Z][A-Z0-9-]*)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match[1].toUpperCase();
  }

  // 单独的基因名（如 TP53, BRCA1）
  const geneMatch = message.match(/\b([A-Z][A-Z0-9]{1,9})\b/g);
  if (geneMatch) {
    const commonGenes = ['TP53', 'BRCA1', 'BRCA2', 'EGFR', 'KRAS', 'MYC', 'PTEN', 'AKT1', 'PIK3CA'];
    for (const g of geneMatch) {
      if (commonGenes.includes(g.toUpperCase())) {
        return g.toUpperCase();
      }
    }
    // 返回第一个看起来像基因名的词
    return geneMatch[0].toUpperCase();
  }

  return null;
}

/**
 * 从消息中提取分子名/化合物名
 */
function extractMoleculeName(message: string): string | null {
  const patterns = [
    /分子[：:]\s*([A-Za-z0-9-]+)/i,
    /化合物[：:]\s*([A-Za-z0-9-]+)/i,
    /查询\s*([a-zA-Z]+)/,
    /SMILES[：:]\s*([A-Za-z0-9@+\[\]()#%=.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match[1];
  }

  // 检测 SMILES 格式
  const smilesMatch = message.match(/[A-Za-z0-9@+\[\]()#%=]{5,}/);
  if (smilesMatch) return smilesMatch[0];

  return null;
}

/**
 * 格式化 UniProt 查询结果
 */
function formatUniProtResult(result: any): string {
  if (!result.success || !result.results?.length) {
    return `❌ 未找到相关蛋白质信息`;
  }

  const protein = result.results[0];
  return `✅ **UniProt 查询结果**

**蛋白质信息**：
- Accession: ${protein.accession}
- 名称: ${protein.protein_name || '未知'}
- 基因: ${protein.gene || '未知'}
- 物种: ${protein.organism || '未知'}
- 序列长度: ${protein.length || '未知'} aa
${protein.function ? `- 功能: ${protein.function.substring(0, 200)}...` : ''}

💡 数据来源: UniProt (https://www.uniprot.org)`;
}

/**
 * 格式化 PubChem 查询结果
 */
function formatPubChemResult(result: any): string {
  if (!result.success || !result.data) {
    return `❌ 未找到相关分子信息`;
  }

  const data = result.data;
  return `✅ **PubChem 查询结果**

**分子信息**：
- CID: ${data.CID}
- 分子式: ${data.MolecularFormula}
- 分子量: ${data.MolecularWeight}
- InChI: ${data.InChI?.substring(0, 50)}...

💡 数据来源: PubChem (https://pubchem.ncbi.nlm.nih.gov)`;
}

/**
 * 格式化 Ensembl 查询结果
 */
function formatEnsemblResult(result: any): string {
  if (!result.success || !result.gene) {
    return `❌ 未找到相关基因信息`;
  }

  const gene = result.gene;
  return `✅ **Ensembl 查询结果**

**基因信息**：
- Ensembl ID: ${gene.id}
- 名称: ${gene.name}
- 类型: ${gene.biotype}
- 染色体: ${gene.chromosome}
- 位置: ${gene.start}-${gene.end} (${gene.strand === 1 ? '+' : '-'})
${gene.description ? `- 描述: ${gene.description}` : ''}

💡 数据来源: Ensembl (https://www.ensembl.org)`;
}

/**
 * 格式化 NCBI 查询结果
 */
function formatNCBIResult(result: any): string {
  if (!result.success || !result.ids?.length) {
    return `❌ 未找到相关记录`;
  }

  return `✅ **NCBI ${result.database} 查询结果**

找到 ${result.count} 条记录，前 ${result.ids.length} 条 ID：
${result.ids.slice(0, 5).join(', ')}

💡 数据来源: NCBI (https://www.ncbi.nlm.nih.gov)`;
}

/**
 * 格式化 ChEMBL 查询结果
 */
function formatChEMBLResult(result: any): string {
  if (!result.success || !result.data?.length) {
    return `❌ 未找到相关化合物信息`;
  }

  const compound = result.data[0];
  return `✅ **ChEMBL 查询结果**

**化合物信息**：
- ChEMBL ID: ${compound.molecule_chembl_id}
- 名称: ${compound.pref_name || '未知'}

💡 数据来源: ChEMBL (https://www.ebi.ac.uk/chembl)`;
}

/**
 * 格式化文献检索结果
 */
function formatEuropePMCResult(result: any): string {
  if (!result.success || !result.results?.length) {
    return `❌ 未找到相关文献`;
  }

  const papers = result.results.slice(0, 5);
  const formatted = papers.map((p: any, i: number) =>
    `${i + 1}. ${p.title}\n   作者: ${p.authors || '未知'} | 年份: ${p.year || '未知'} | DOI: ${p.doi || '无'}`
  ).join('\n\n');

  return `✅ **Europe PMC 文献检索结果**

共找到 ${result.total} 篇文献，显示前 ${papers.length} 篇：

${formatted}

💡 数据来源: Europe PMC (https://europepmc.org)`;
}

/**
 * AgentDef 转 Agent 适配器
 *
 * 将声明式的 AgentDef 转换为 Agent 接口
 * 集成 toolRegistry 中的工具
 */
function agentDefToAgent(def: typeof ModelAgentDef | typeof AnalysisAgentDef): Agent {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    capabilities: {
      inputs: [],
      outputs: [],
      skills: def.skills || [],
    },
    processMessage: async (message: string) => {
      // 对于 Analysis Agent，使用工具系统
      if (def.id === 'analysis-agent') {
        const coreServices = getCoreServices();
        if (!coreServices) {
          return {
            content: '⚠️ 服务未初始化，请稍后重试',
            type: 'text' as const,
          };
        }

        const toolRegistry = coreServices.toolRegistry;
        const msgLower = message.toLowerCase();

        try {
          // ========== UniProt 查询 ==========
          if (msgLower.includes('uniprot') || msgLower.includes('蛋白') || msgLower.includes('protein')) {
            const uniprotId = extractUniProtId(message);
            const geneName = extractGeneName(message);
            const query = uniprotId || geneName;

            if (query) {
              const tool = toolRegistry.getTool('uniprot_search');
              if (tool) {
                console.log(`[Analysis Agent] Calling uniprot_search with query: ${query}`);
                const result = await tool.execute({ query, limit: 5 }, createEmptyToolContext());
                return {
                  content: `🔬 **Analysis Agent - 蛋白质查询**\n\n${formatUniProtResult(result)}`,
                  type: 'text' as const,
                };
              }
            }
          }

          // ========== PubChem/分子查询 ==========
          if (msgLower.includes('pubchem') || msgLower.includes('分子') || msgLower.includes('molecule') || msgLower.includes('smiles')) {
            const molecule = extractMoleculeName(message);
            if (molecule) {
              const tool = toolRegistry.getTool('pubchem_search');
              if (tool) {
                console.log(`[Analysis Agent] Calling pubchem_search with query: ${molecule}`);
                const result = await tool.execute({ query: molecule }, createEmptyToolContext());
                return {
                  content: `🔬 **Analysis Agent - 分子查询**\n\n${formatPubChemResult(result)}`,
                  type: 'text' as const,
                };
              }
            }
          }

          // ========== Ensembl/基因查询 ==========
          if (msgLower.includes('ensembl') || msgLower.includes('基因') || msgLower.includes('gene') || msgLower.includes('基因组')) {
            const geneName = extractGeneName(message);
            if (geneName) {
              const tool = toolRegistry.getTool('ensembl_lookup');
              if (tool) {
                console.log(`[Analysis Agent] Calling ensembl_lookup with symbol: ${geneName}`);
                const result = await tool.execute({ symbol: geneName }, createEmptyToolContext());
                return {
                  content: `🔬 **Analysis Agent - 基因查询**\n\n${formatEnsemblResult(result)}`,
                  type: 'text' as const,
                };
              }
            }
          }

          // ========== ChEMBL 查询 ==========
          if (msgLower.includes('chembl') || msgLower.includes('活性') || msgLower.includes('activity')) {
            const molecule = extractMoleculeName(message);
            if (molecule) {
              const tool = toolRegistry.getTool('chembl_search');
              if (tool) {
                console.log(`[Analysis Agent] Calling chembl_search with query: ${molecule}`);
                const result = await tool.execute({ query: molecule }, createEmptyToolContext());
                return {
                  content: `🔬 **Analysis Agent - 生物活性查询**\n\n${formatChEMBLResult(result)}`,
                  type: 'text' as const,
                };
              }
            }
          }

          // ========== NCBI 查询 ==========
          if (msgLower.includes('ncbi') || msgLower.includes('pubmed') || msgLower.includes('文献') || msgLower.includes('literature')) {
            const geneName = extractGeneName(message) || extractMoleculeName(message);
            if (geneName) {
              const tool = toolRegistry.getTool('ncbi_esearch');
              if (tool) {
                const database = msgLower.includes('pubmed') || msgLower.includes('文献') ? 'pubmed' : 'gene';
                console.log(`[Analysis Agent] Calling ncbi_esearch with term: ${geneName}, db: ${database}`);
                const result = await tool.execute({ database, term: geneName }, createEmptyToolContext());
                return {
                  content: `🔬 **Analysis Agent - NCBI 查询**\n\n${formatNCBIResult(result)}`,
                  type: 'text' as const,
                };
              }
            }
          }

          // ========== 文献检索 (Europe PMC) ==========
          if (msgLower.includes('文献') || msgLower.includes('paper') || msgLower.includes('文章') || msgLower.includes('搜索')) {
            // 提取搜索词
            const searchTerms = message.replace(/文献|paper|文章|搜索|查询|查找/g, '').trim();
            if (searchTerms.length > 2) {
              const tool = toolRegistry.getTool('europe_pmc_search');
              if (tool) {
                console.log(`[Analysis Agent] Calling europe_pmc_search with query: ${searchTerms}`);
                const result = await tool.execute({ query: searchTerms, pageSize: 5 }, createEmptyToolContext());
                return {
                  content: `🔬 **Analysis Agent - 文献检索**\n\n${formatEuropePMCResult(result)}`,
                  type: 'text' as const,
                };
              }
            }
          }

          // ========== KEGG 通路查询 ==========
          if (msgLower.includes('kegg') || msgLower.includes('通路') || msgLower.includes('pathway')) {
            const geneName = extractGeneName(message);
            if (geneName) {
              const tool = toolRegistry.getTool('kegg_find');
              if (tool) {
                console.log(`[Analysis Agent] Calling kegg_find with query: ${geneName}`);
                const result = await tool.execute({ database: 'pathway', query: geneName }, createEmptyToolContext()) as any;
                if (result.success) {
                  const formatted = result.results?.map((r: any) => `- ${r.id}: ${r.description}`).join('\n') || '无结果';
                  return {
                    content: `🔬 **Analysis Agent - KEGG 通路查询**\n\n✅ 查询结果：\n${formatted}\n\n💡 数据来源: KEGG (https://www.kegg.jp)`,
                    type: 'text' as const,
                  };
                }
              }
            }
          }

          // ========== FDA 药品查询 ==========
          if (msgLower.includes('fda') || msgLower.includes('药品') || msgLower.includes('drug')) {
            const drugName = extractMoleculeName(message);
            if (drugName) {
              const tool = toolRegistry.getTool('fda_drug_search');
              if (tool) {
                console.log(`[Analysis Agent] Calling fda_drug_search with query: ${drugName}`);
                const result = await tool.execute({ query: drugName, limit: 3 }, createEmptyToolContext()) as any;
                if (result.success && result.results?.length) {
                  const formatted = result.results.map((r: any, i: number) =>
                    `${i + 1}. ${r.brand_name || '未知'} (${r.generic_name || '通用名未知'})\n   厂商: ${r.manufacturer || '未知'} | 用途: ${r.purpose || '未知'}`
                  ).join('\n\n');
                  return {
                    content: `🔬 **Analysis Agent - FDA 药品查询**\n\n✅ 查询结果：\n\n${formatted}\n\n💡 数据来源: FDA (https://www.fda.gov)`,
                    type: 'text' as const,
                  };
                }
              }
            }
          }

          // ========== STRING 蛋白相互作用 ==========
          if (msgLower.includes('string') || msgLower.includes('相互作用') || msgLower.includes('interaction')) {
            const geneName = extractGeneName(message);
            if (geneName) {
              const tool = toolRegistry.getTool('string_interaction');
              if (tool) {
                console.log(`[Analysis Agent] Calling string_interaction with proteins: ${geneName}`);
                const result = await tool.execute({ proteins: geneName, species: 9606 }, createEmptyToolContext()) as any;
                if (result.success) {
                  return {
                    content: `🔬 **Analysis Agent - 蛋白相互作用查询**\n\n✅ 找到 ${result.count} 个相互作用\n\n💡 数据来源: STRING DB (https://string-db.org)`,
                    type: 'text' as const,
                  };
                }
              }
            }
          }

          // ========== TCGA 数据查询 ==========
          if (msgLower.includes('tcga') || msgLower.includes('癌症') || msgLower.includes('cancer')) {
            const tool = toolRegistry.getTool('tcga_gdc_search');
            if (tool) {
              console.log(`[Analysis Agent] Calling tcga_gdc_search`);
              const result = await tool.execute({ data_type: 'projects' }, createEmptyToolContext()) as any;
              if (result.success) {
                const projects = result.data.slice(0, 5).map((p: any) => p.project_id).join(', ');
                return {
                  content: `🔬 **Analysis Agent - TCGA 数据查询**\n\n✅ 可用项目：${projects}\n\n💡 数据来源: GDC (https://portal.gdc.cancer.gov)`,
                  type: 'text' as const,
                };
              }
            }
          }

          // 默认：无法识别的请求
          return {
            content: `🔬 **Analysis Agent**

我可以帮助您查询以下信息：

**蛋白质与基因**：
- UniProt 查询："查询蛋白 P04637" 或 "TP53 的 UniProt 信息"
- Ensembl 查询："查询 TP53 基因"
- STRING 相互作用："TP53 的蛋白质相互作用"

**分子与化合物**：
- PubChem 查询："查询 aspirin 的分子信息"
- ChEMBL 查询："查询阿司匹林的生物活性"

**文献与数据库**：
- NCBI 查询："在 PubMed 搜索 TP53"
- 文献检索："搜索 CRISPR 相关文献"
- KEGG 通路："查询 TP53 相关通路"
- FDA 药品："查询阿司匹林的 FDA 信息"
- TCGA 数据："列出 TCGA 项目"

请描述您的查询需求。`,
            type: 'text' as const,
          };

        } catch (error) {
          console.error('[Analysis Agent] Error:', error);
          return {
            content: `❌ 查询过程中发生错误：${error instanceof Error ? error.message : String(error)}`,
            type: 'text' as const,
          };
        }
      }

      // Model Agent 的默认响应
      return {
        content: `⚠️ **${def.name}** 功能正在开发中\n\n暂时无法处理此请求。请使用 Data Agent 进行数据相关操作，或等待后续版本更新。\n\n您的请求：${message}`,
        type: 'text' as const,
      };
    },
  };
}

/**
 * 简单的 Agent 注册表（向后兼容）
 */
class SimpleAgentRegistry {
  private readonly agents = new Map<string, Agent>();

  register(agent: Agent): void {
    this.agents.set(agent.id, agent);
  }

  get(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  getDefault(): Agent {
    // 返回 data-agent 作为默认
    const dataAgentInstance = this.agents.get('data-agent');
    if (dataAgentInstance) {
      return dataAgentInstance;
    }
    const agent = this.agents.values().next().value as Agent | undefined;
    if (!agent) {
      throw new Error('No agents registered');
    }
    return agent;
  }

  getAll(): Agent[] {
    return Array.from(this.agents.values());
  }
}

export const agentRegistry = new SimpleAgentRegistry();

// 注册 Data Agent
agentRegistry.register(dataAgent as Agent);

// 注册 Model Agent 和 Analysis Agent（占位实现）
agentRegistry.register(agentDefToAgent(ModelAgentDef));
agentRegistry.register(agentDefToAgent(AnalysisAgentDef));

// 导出新的 registry 供高级使用
export { NewAgentRegistry };

// 导出 Agent 定义
export { ModelAgentDef } from './model-agent.js';
export { AnalysisAgentDef } from './analysis-agent.js';

// 导出 Data Agent 相关
export {
  dataAgent,
  dataAgentMeta,
  dataAgentProcessor,
  createDataAgentConfig,
};
export * from './types.js';
export * from './base.js';
