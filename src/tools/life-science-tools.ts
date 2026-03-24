/**
 * Life Science Tools - 生命科学工具集成
 * 
 * 聚焦生命科学领域，集成所有可访问的公开 API
 * 不可访问的工具标记为"无法访问"
 */

import type { ToolDef } from '../core/types.js';

// ============================================
// 可访问的公开 API 工具（12个）
// ============================================

/**
 * PubChem API 工具 - 分子查询
 */
export function createPubChemTool(): ToolDef {
  return {
    name: 'pubchem_search',
    description: '查询 PubChem 数据库，获取分子的化学信息、结构和性质。支持通过名称、SMILES、CID 等查询。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '查询关键词：分子名称、SMILES 或 PubChem CID',
        },
        query_type: {
          type: 'string',
          enum: ['name', 'smiles', 'cid'],
          description: '查询类型',
        },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description: '要获取的属性列表，如 MolecularFormula, MolecularWeight, InChI 等',
        },
      },
      required: ['query'],
    },
    execute: async (params) => {
      const { query, query_type = 'name', properties = ['MolecularFormula', 'MolecularWeight'] } = params as any;
      
      try {
        const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/${query_type}/${encodeURIComponent(query)}/property/${properties.join(',')}/JSON`;
        const response = await fetch(url);
        
        if (!response.ok) {
          return { success: false, error: `PubChem API error: ${response.status}` };
        }
        
        const data = await response.json();
        return {
          success: true,
          source: 'PubChem',
          data: data.PropertyTable.Properties[0],
          cid: data.PropertyTable.Properties[0].CID,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };
}

/**
 * ChEMBL API 工具 - 生物活性数据
 */
export function createChEMBLTool(): ToolDef {
  return {
    name: 'chembl_search',
    description: '查询 ChEMBL 数据库，获取化合物的生物活性数据、靶点信息和药物开发状态。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '查询关键词：化合物名称、ChEMBL ID 或 SMILES',
        },
        search_type: {
          type: 'string',
          enum: ['molecule', 'target', 'activity'],
          description: '搜索类型：分子、靶点或活性数据',
        },
      },
      required: ['query'],
    },
    execute: async (params) => {
      const { query, search_type = 'molecule' } = params as any;
      
      try {
        const url = `https://www.ebi.ac.uk/chembl/api/data/${search_type}/search.json?q=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          return { success: false, error: `ChEMBL API error: ${response.status}` };
        }
        
        const data = await response.json();
        return {
          success: true,
          source: 'ChEMBL',
          data: data[`${search_type}s`],
          count: data[`${search_type}s`]?.length || 0,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };
}

/**
 * UniProt API 工具 - 蛋白质数据库
 */
export function createUniProtTool(): ToolDef {
  return {
    name: 'uniprot_search',
    description: '查询 UniProt 数据库，获取蛋白质序列、功能注释、结构信息。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '查询关键词：基因名、蛋白质名、UniProt ID 等',
        },
        organism: {
          type: 'string',
          description: '物种名称，如 human, mouse',
        },
        limit: {
          type: 'number',
          description: '返回结果数量限制',
        },
      },
      required: ['query'],
    },
    execute: async (params) => {
      const { query, organism, limit = 10 } = params as any;
      
      try {
        let queryString = query;
        if (organism) {
          queryString += ` AND organism:${organism}`;
        }
        
        const url = `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(queryString)}&format=json&size=${limit}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          return { success: false, error: `UniProt API error: ${response.status}` };
        }
        
        const data = await response.json();
        return {
          success: true,
          source: 'UniProt',
          results: data.results.map((r: any) => ({
            accession: r.primaryAccession,
            protein_name: r.proteinDescription?.recommendedName?.fullName?.value,
            gene: r.genes?.[0]?.geneName?.value,
            organism: r.organism?.scientificName,
            length: r.sequence?.length,
            function: r.comments?.find((c: any) => c.topic === 'FUNCTION')?.texts?.[0]?.value,
          })),
          count: data.results.length,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };
}

/**
 * STRING DB API 工具 - 蛋白质相互作用
 */
export function createSTRINGTool(): ToolDef {
  return {
    name: 'string_interaction',
    description: '查询 STRING 数据库，获取蛋白质相互作用网络和功能富集分析。',
    parameters: {
      type: 'object',
      properties: {
        proteins: {
          type: 'string',
          description: '蛋白质标识符，多个用逗号分隔',
        },
        species: {
          type: 'number',
          description: '物种 NCBI Taxonomy ID，如 9606 (人类)',
        },
        output: {
          type: 'string',
          enum: ['network', 'interaction_partners', 'enrichment'],
          description: '输出类型：网络、相互作用伙伴或富集分析',
        },
      },
      required: ['proteins'],
    },
    execute: async (params) => {
      const { proteins, species = 9606, output = 'network' } = params as any;
      
      try {
        const url = `https://string-db.org/api/json/${output}?identifiers=${encodeURIComponent(proteins)}&species=${species}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          return { success: false, error: `STRING API error: ${response.status}` };
        }
        
        const data = await response.json();
        return {
          success: true,
          source: 'STRING',
          data: data,
          count: Array.isArray(data) ? data.length : 0,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };
}

/**
 * Ensembl API 工具 - 基因组注释
 */
export function createEnsemblTool(): ToolDef {
  return {
    name: 'ensembl_lookup',
    description: '查询 Ensembl 数据库，获取基因、转录本、变异的详细注释信息。',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: '基因符号，如 TP53',
        },
        species: {
          type: 'string',
          description: '物种，如 homo_sapiens',
        },
        expand: {
          type: 'number',
          description: '是否展开转录本信息 (1=是)',
        },
      },
      required: ['symbol'],
    },
    execute: async (params) => {
      const { symbol, species = 'homo_sapiens', expand = 0 } = params as any;
      
      try {
        const url = `https://rest.ensembl.org/lookup/symbol/${species}/${encodeURIComponent(symbol)}?content-type=application/json&expand=${expand}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          return { success: false, error: `Ensembl API error: ${response.status}` };
        }
        
        const data = await response.json();
        return {
          success: true,
          source: 'Ensembl',
          gene: {
            id: data.id,
            name: data.display_name,
            biotype: data.biotype,
            description: data.description,
            chromosome: data.seq_region_name,
            start: data.start,
            end: data.end,
            strand: data.strand,
          },
          transcripts: data.Transcript?.slice(0, 5).map((t: any) => ({
            id: t.id,
            biotype: t.biotype,
            length: t.length,
          })),
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };
}

/**
 * NCBI E-utilities API 工具 - 文献和序列数据库
 */
export function createNCBITool(): ToolDef {
  return {
    name: 'ncbi_esearch',
    description: '查询 NCBI 数据库，搜索文献、基因、蛋白质、核酸序列等。',
    parameters: {
      type: 'object',
      properties: {
        database: {
          type: 'string',
          enum: ['pubmed', 'gene', 'protein', 'nucleotide', 'sra'],
          description: '数据库名称',
        },
        term: {
          type: 'string',
          description: '搜索词',
        },
        retmax: {
          type: 'number',
          description: '返回结果数量',
        },
      },
      required: ['database', 'term'],
    },
    execute: async (params) => {
      const { database, term, retmax = 10 } = params as any;
      
      try {
        // 添加延时以遵守 NCBI API 限额（3次/秒）
        await new Promise(resolve => setTimeout(resolve, 350));
        
        const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=${database}&term=${encodeURIComponent(term)}&retmode=json&retmax=${retmax}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          return { success: false, error: `NCBI API error: ${response.status}` };
        }
        
        const data = await response.json();
        return {
          success: true,
          source: 'NCBI',
          database,
          ids: data.esearchresult.idlist,
          count: data.esearchresult.count,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };
}

/**
 * TCGA GDC API 工具 - 癌症基因组数据
 */
export function createGDCtool(): ToolDef {
  return {
    name: 'tcga_gdc_search',
    description: '查询 TCGA GDC 数据库，获取癌症基因组数据、临床信息和文件。',
    parameters: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: '项目ID，如 TCGA-BRCA',
        },
        data_type: {
          type: 'string',
          enum: ['projects', 'cases', 'files', 'genes'],
          description: '数据类型',
        },
      },
      required: ['data_type'],
    },
    execute: async (params) => {
      const { project_id, data_type = 'projects' } = params as any;
      
      try {
        let url = 'https://api.gdc.cancer.gov/';
        
        if (data_type === 'projects') {
          url += 'projects?size=20';
        } else if (data_type === 'cases' && project_id) {
          url += `cases?filters={"project.project_id":"${project_id}"}&size=10`;
        } else if (data_type === 'files' && project_id) {
          url += `files?filters={"cases.project.project_id":"${project_id}"}&size=10`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
          return { success: false, error: `GDC API error: ${response.status}` };
        }
        
        const data = await response.json();
        return {
          success: true,
          source: 'TCGA GDC',
          data: data.data?.hits || data,
          count: data.data?.hits?.length || 0,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };
}

/**
 * KEGG API 工具 - 通路数据库
 */
export function createKEGGTool(): ToolDef {
  return {
    name: 'kegg_find',
    description: '查询 KEGG 数据库，获取代谢通路、基因功能注释等信息。',
    parameters: {
      type: 'object',
      properties: {
        database: {
          type: 'string',
          enum: ['pathway', 'gene', 'compound', 'enzyme'],
          description: 'KEGG 数据库',
        },
        query: {
          type: 'string',
          description: '查询关键词',
        },
      },
      required: ['database', 'query'],
    },
    execute: async (params) => {
      const { database, query } = params as any;
      
      try {
        const url = `http://rest.kegg.jp/find/${database}/${encodeURIComponent(query)}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          return { success: false, error: `KEGG API error: ${response.status}` };
        }
        
        const text = await response.text();
        const lines = text.trim().split('\n').slice(0, 10);
        const results = lines.map(line => {
          const [id, ...rest] = line.split('\t');
          return { id, description: rest.join('\t') };
        });
        
        return {
          success: true,
          source: 'KEGG',
          results,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };
}

/**
 * FDA API 工具 - 药品监管数据
 */
export function createFDATool(): ToolDef {
  return {
    name: 'fda_drug_search',
    description: '查询 FDA 药品数据库，获取药品标签、批准信息和安全性数据。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '查询关键词：药品名称或活性成分',
        },
        limit: {
          type: 'number',
          description: '返回结果数量',
        },
      },
      required: ['query'],
    },
    execute: async (params) => {
      const { query, limit = 5 } = params as any;
      
      try {
        const url = `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(query)}&limit=${limit}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          return { success: false, error: `FDA API error: ${response.status}` };
        }
        
        const data = await response.json();
        return {
          success: true,
          source: 'FDA',
          results: data.results.map((r: any) => ({
            brand_name: r.openfda?.brand_name?.[0],
            generic_name: r.openfda?.generic_name?.[0],
            manufacturer: r.openfda?.manufacturer_name?.[0],
            route: r.openfda?.route?.[0],
            purpose: r.purpose?.[0],
            indications: r.indications_and_usage?.[0],
          })),
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };
}

/**
 * Europe PMC API 工具 - 文献检索
 */
export function createEuropePMCTool(): ToolDef {
  return {
    name: 'europe_pmc_search',
    description: '查询 Europe PMC 数据库，搜索科学文献和引文信息。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索词',
        },
        pageSize: {
          type: 'number',
          description: '返回结果数量',
        },
      },
      required: ['query'],
    },
    execute: async (params) => {
      const { query, pageSize = 10 } = params as any;
      
      try {
        const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=${pageSize}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          return { success: false, error: `Europe PMC API error: ${response.status}` };
        }
        
        const data = await response.json();
        return {
          success: true,
          source: 'Europe PMC',
          results: data.resultList?.result?.map((r: any) => ({
            pmid: r.pmid,
            pmcid: r.pmcid,
            title: r.title,
            authors: r.authorString,
            journal: r.journalTitle,
            year: r.pubYear,
            doi: r.doi,
          })),
          total: data.hitCount,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };
}

/**
 * UCSC Genome Browser API 工具
 */
export function createUCSCTool(): ToolDef {
  return {
    name: 'ucsc_genome',
    description: '查询 UCSC 基因组浏览器数据库，获取基因组注释和序列信息。',
    parameters: {
      type: 'object',
      properties: {
        genome: {
          type: 'string',
          description: '基因组版本，如 hg38',
        },
        track: {
          type: 'string',
          description: '注释轨道名称',
        },
      },
      required: ['genome'],
    },
    execute: async (params) => {
      const { genome } = params as any;
      
      try {
        const url = `https://api.genome.ucsc.edu/list/tracks?genome=${genome}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          return { success: false, error: `UCSC API error: ${response.status}` };
        }
        
        const data = await response.json();
        return {
          success: true,
          source: 'UCSC Genome Browser',
          genome,
          tracks: Object.keys(data[genome] || {}).slice(0, 20),
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };
}

/**
 * BLAST API 工具 - 序列比对
 */
export function createBlastTool(): ToolDef {
  return {
    name: 'blast_search',
    description: '执行 BLAST 序列比对，搜索相似的蛋白质或核酸序列。',
    parameters: {
      type: 'object',
      properties: {
        sequence: {
          type: 'string',
          description: '查询序列（FASTA 格式或纯序列）',
        },
        program: {
          type: 'string',
          enum: ['blastp', 'blastn', 'blastx'],
          description: 'BLAST 程序',
        },
        database: {
          type: 'string',
          description: '数据库，如 nr, swissprot',
        },
      },
      required: ['sequence'],
    },
    execute: async (params) => {
      const { sequence, program = 'blastp', database = 'swissprot' } = params as any;
      
      // BLAST 需要通过 NCBI 的在线服务，这里返回提示信息
      return {
        success: false,
        error: 'BLAST 搜索需要较长执行时间，建议使用 NCBI BLAST 网页版',
        alternative_url: `https://blast.ncbi.nlm.nih.gov/Blast.cgi?PROGRAM=${program}&PAGE_TYPE=BlastSearch&LINK_LOC=blasthome`,
        sequence: sequence.substring(0, 100) + '...',
      };
    },
  };
}

// ============================================
// 不可访问的工具（13个）- SCP API 密钥过期
// ============================================

/**
 * SCP 工具不可访问提示
 */
export function createSCPUnavailableTool(name: string, description: string): ToolDef {
  return {
    name: `scp_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    description: `[无法访问] ${description} - SCP API 密钥已过期，请联系管理员`,
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      return {
        success: false,
        error: 'SCP API 不可用',
        reason: 'user token expired',
        solution: '请联系 SCP Hub 管理员更新 API 密钥',
        service: name,
      };
    },
  };
}

/**
 * 注册所有生命科学工具
 */
export function registerLifeScienceTools(registry: { register: (tool: ToolDef) => void }): void {
  // 注册可访问的公开 API 工具
  registry.register(createPubChemTool());
  registry.register(createChEMBLTool());
  registry.register(createUniProtTool());
  registry.register(createSTRINGTool());
  registry.register(createEnsemblTool());
  registry.register(createNCBITool());
  registry.register(createGDCtool());
  registry.register(createKEGGTool());
  registry.register(createFDATool());
  registry.register(createEuropePMCTool());
  registry.register(createUCSCTool());
  registry.register(createBlastTool());
  
  // 注册不可访问的 SCP 工具
  registry.register(createSCPUnavailableTool('DrugSDA-Tool', '药物分子筛选、设计与分析工具集'));
  registry.register(createSCPUnavailableTool('DrugSDA-Model', '分子对接、ADMET评估等AI模型'));
  registry.register(createSCPUnavailableTool('VenusFactory', '蛋白质工程AI全流程工具'));
  registry.register(createSCPUnavailableTool('SciToolAgent-Chem', '化学实验综合性工具库'));
  registry.register(createSCPUnavailableTool('ChemCalc', '化学反应参数计算'));
  registry.register(createSCPUnavailableTool('Thoth', '湿实验智能编排系统'));
  registry.register(createSCPUnavailableTool('SciToolAgent-Bio', '蛋白质组学工具库'));
  registry.register(createSCPUnavailableTool('SciGraph-Bio', '生命科学知识图谱'));
  registry.register(createSCPUnavailableTool('SciGraph', '科学研究统一知识查询'));
  registry.register(createSCPUnavailableTool('ToolUniverse', '标准化工具生态平台'));
  registry.register(createSCPUnavailableTool('DataStats', '数据处理与统计分析'));
  registry.register(createSCPUnavailableTool('Origene-OpenTargets', '靶点发现与验证'));
  registry.register(createSCPUnavailableTool('Origene-Monarch', '疾病-表型-基因关联'));
  
  console.log('[Life Science Tools] Registered 25 tools (12 available, 13 unavailable)');
}
