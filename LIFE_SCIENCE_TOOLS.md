# 生命科学工具集成文档

## 📊 工具概览

**已集成工具**: 25个
- ✅ **可用工具**: 12个（公开API）
- ❌ **不可用工具**: 13个（SCP API 密钥过期）

---

## ✅ 可用工具（公开API）

### 1. 分子与化学类

#### 1.1 PubChem API - 分子查询
**工具名**: `pubchem_search`

**功能**: 查询分子的化学信息、结构和性质

**参数**:
- `query` (必填): 查询关键词（分子名称、SMILES 或 CID）
- `query_type`: name | smiles | cid (默认: name)
- `properties`: 属性列表 (默认: MolecularFormula, MolecularWeight)

**示例**:
```json
{
  "query": "aspirin",
  "query_type": "name",
  "properties": ["MolecularFormula", "MolecularWeight", "InChI"]
}
```

**返回**:
```json
{
  "success": true,
  "source": "PubChem",
  "cid": 2244,
  "data": {
    "CID": 2244,
    "MolecularFormula": "C9H8O4",
    "MolecularWeight": "180.16",
    "InChI": "InChI=1S/C9H8O4/c1-..."
  }
}
```

---

#### 1.2 ChEMBL API - 生物活性数据
**工具名**: `chembl_search`

**功能**: 查询化合物的生物活性数据、靶点信息

**参数**:
- `query` (必填): 查询关键词
- `search_type`: molecule | target | activity (默认: molecule)

**示例**:
```json
{
  "query": "aspirin",
  "search_type": "molecule"
}
```

**返回**: ChEMBL ID、SMILES、活性数据等

---

#### 1.3 FDA API - 药品监管数据
**工具名**: `fda_drug_search`

**功能**: 查询 FDA 药品标签、批准信息

**参数**:
- `query` (必填): 药品名称或活性成分
- `limit`: 返回结果数量

**示例**:
```json
{
  "query": "aspirin",
  "limit": 5
}
```

---

#### 1.4 KEGG API - 通路数据库
**工具名**: `kegg_find`

**功能**: 查询代谢通路、基因功能注释

**参数**:
- `database` (必填): pathway | gene | compound | enzyme
- `query` (必填): 查询关键词

**示例**:
```json
{
  "database": "pathway",
  "query": "glycolysis"
}
```

---

### 2. 蛋白质类

#### 2.1 UniProt API - 蛋白质数据库
**工具名**: `uniprot_search`

**功能**: 查询蛋白质序列、功能注释

**参数**:
- `query` (必填): 查询关键词（基因名、蛋白质名、ID）
- `organism`: 物种名称
- `limit`: 返回结果数量

**示例**:
```json
{
  "query": "TP53",
  "organism": "human",
  "limit": 5
}
```

**返回**:
```json
{
  "success": true,
  "source": "UniProt",
  "results": [
    {
      "accession": "P04637",
      "protein_name": "Cellular tumor antigen p53",
      "gene": "TP53",
      "organism": "Homo sapiens",
      "length": 393
    }
  ]
}
```

---

#### 2.2 STRING DB API - 蛋白质相互作用
**工具名**: `string_interaction`

**功能**: 查询蛋白质相互作用网络

**参数**:
- `proteins` (必填): 蛋白质标识符（逗号分隔）
- `species`: 物种 NCBI Taxonomy ID (默认: 9606 人类)
- `output`: network | interaction_partners | enrichment

**示例**:
```json
{
  "proteins": "TP53,BRCA1",
  "species": 9606,
  "output": "network"
}
```

---

### 3. 基因组类

#### 3.1 Ensembl API - 基因组注释
**工具名**: `ensembl_lookup`

**功能**: 查询基因、转录本详细注释

**参数**:
- `symbol` (必填): 基因符号
- `species`: 物种 (默认: homo_sapiens)
- `expand`: 是否展开转录本 (1=是)

**示例**:
```json
{
  "symbol": "TP53",
  "species": "homo_sapiens",
  "expand": 1
}
```

**返回**:
```json
{
  "success": true,
  "source": "Ensembl",
  "gene": {
    "id": "ENSG00000141510",
    "name": "TP53",
    "chromosome": "17",
    "start": 7661779,
    "end": 7687550
  }
}
```

---

#### 3.2 NCBI E-utilities - 文献与序列数据库
**工具名**: `ncbi_esearch`

**功能**: 搜索 NCBI 数据库（文献、基因、蛋白质、核酸）

**参数**:
- `database` (必填): pubmed | gene | protein | nucleotide | sra
- `term` (必填): 搜索词
- `retmax`: 返回结果数量

**示例**:
```json
{
  "database": "pubmed",
  "term": "TP53 cancer",
  "retmax": 10
}
```

**注意**: NCBI API 限速为 3次/秒，已自动添加延时

---

#### 3.3 TCGA GDC API - 癌症基因组数据
**工具名**: `tcga_gdc_search`

**功能**: 查询 TCGA 癌症基因组数据

**参数**:
- `data_type` (必填): projects | cases | files | genes
- `project_id`: 项目ID (如 TCGA-BRCA)

**示例**:
```json
{
  "data_type": "projects"
}
```

---

#### 3.4 UCSC Genome Browser API
**工具名**: `ucsc_genome`

**功能**: 查询 UCSC 基因组注释

**参数**:
- `genome` (必填): 基因组版本 (如 hg38)

**示例**:
```json
{
  "genome": "hg38"
}
```

---

### 4. 文献检索类

#### 4.1 Europe PMC API - 文献检索
**工具名**: `europe_pmc_search`

**功能**: 搜索科学文献

**参数**:
- `query` (必填): 搜索词
- `pageSize`: 返回结果数量

**示例**:
```json
{
  "query": "CRISPR gene editing",
  "pageSize": 10
}
```

---

#### 4.2 BLAST API - 序列比对
**工具名**: `blast_search`

**功能**: 执行 BLAST 序列比对

**参数**:
- `sequence` (必填): 查询序列
- `program`: blastp | blastn | blastx (默认: blastp)
- `database`: 数据库 (默认: swissprot)

**注意**: BLAST 搜索建议使用 NCBI 网页版

---

## ❌ 不可用工具（SCP API）

以下工具因 SCP API 密钥过期暂时无法使用：

| 工具名 | 提供方 | 工具数 | 状态 |
|--------|--------|--------|------|
| DrugSDA-Tool | 北京大学 | 28,600 | ❌ 无法访问 |
| DrugSDA-Model | 北京大学 | 1,700 | ❌ 无法访问 |
| VenusFactory | 上海交通大学 | 1,500 | ❌ 无法访问 |
| SciToolAgent-Chem | 浙江大学 | 505 | ❌ 无法访问 |
| ChemCalc | 上海人工智能实验室 | 276 | ❌ 无法访问 |
| Thoth | 上海人工智能实验室 | 1,300+ | ❌ 无法访问 |
| SciToolAgent-Bio | 浙江大学 | 40 | ❌ 无法访问 |
| SciGraph-Bio | 上海人工智能实验室 | 56 | ❌ 无法访问 |
| SciGraph | 上海人工智能实验室 | 4,800 | ❌ 无法访问 |
| ToolUniverse | 上海人工智能实验室 | 236 | ❌ 无法访问 |
| DataStats | 上海人工智能实验室 | 320 | ❌ 无法访问 |
| Origene-OpenTargets | 临港实验室 | 189 | ❌ 无法访问 |
| Origene-Monarch | 临港实验室 | 49 | ❌ 无法访问 |

**解决方案**: 联系 SCP Hub 管理员更新 API 密钥

---

## 🚀 使用方法

### 1. 通过 Analysis Agent 查询

在网页端输入：
```
查询 TP53 基因的蛋白质信息
```

系统会自动：
1. 识别为分子查询请求
2. 调用 UniProt API
3. 返回蛋白质信息

### 2. 通过 API 直接调用

```bash
# PubChem 查询
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "查询 aspirin 的分子信息",
    "agentId": "analysis-agent"
  }'
```

---

## 📋 API 限额说明

| API | 限额 | 建议 |
|-----|------|------|
| PubChem | 无明确限制 | 建议添加延时 |
| ChEMBL | 无明确限制 | 建议缓存结果 |
| UniProt | 无明确限制 | 建议使用 ETag |
| NCBI | **3次/秒** | ✅ 已自动添加延时 |
| Ensembl | 无明确限制 | 建议使用缓存 |
| KEGG | 无明确限制 | 建议缓存 |
| FDA | 无明确限制 | 建议缓存 |

---

## 🔧 开发者指南

### 添加新工具

1. 在 `src/tools/life-science-tools.ts` 中添加新函数：

```typescript
export function createMyTool(): ToolDef {
  return {
    name: 'my_tool',
    description: '工具描述',
    parameters: { /* ... */ },
    execute: async (params) => {
      // 实现逻辑
      return { success: true, data: result };
    },
  };
}
```

2. 在 `registerLifeScienceTools` 中注册：

```typescript
registry.register(createMyTool());
```

---

## 📝 更新日志

### v1.0.0 (2026-03-24)

**新增功能**:
- ✅ 集成 12 个公开 API 工具
- ✅ 实现 PubChem 分子查询
- ✅ 实现 UniProt 蛋白质检索
- ✅ 实现 ChEMBL 生物活性查询
- ✅ 实现 NCBI 文献和序列搜索
- ✅ 实现 Ensembl 基因组注释
- ✅ 实现 STRING 蛋白质相互作用
- ✅ 实现 TCGA 癌症数据查询
- ✅ 实现 KEGG 通路查询
- ✅ 实现 FDA 药品信息查询
- ✅ 实现 Europe PMC 文献检索
- ✅ 实现 UCSC 基因组浏览器集成
- ✅ 实现 BLAST 序列比对

**标记不可用**:
- ❌ 标记 13 个 SCP 工具为"无法访问"

**优化**:
- 自动处理 NCBI API 限速
- 优先使用公开 API 替代 SCP
- 友好的错误提示

---

## 📞 技术支持

**问题反馈**: 
- GitHub Issues: https://github.com/AGI4Sci/VerumOS/issues

**SCP Hub 问题**:
- 需要更新 API 密钥
- 当前密钥状态: `user token expired`

**公开 API 文档**:
- PubChem: https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest
- ChEMBL: https://chembl.gitbook.io/chembl-interface-documentation/web-services
- UniProt: https://www.uniprot.org/help/api_queries
- NCBI: https://www.ncbi.nlm.nih.gov/books/NBK25501/
- Ensembl: https://rest.ensembl.org/
