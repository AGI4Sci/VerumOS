# Debug Report - debug-02

## 任务
排查本项目中非 SCP 工具使用不了的问题，让这些工具正常工作。

## 发现的问题

### 问题 1: Analysis Agent 没有集成工具系统 (严重)

**位置**: `src/agents/index.ts` 的 `agentDefToAgent` 函数

**现象**:
- 用户查询 "UniProt ID: P04637"
- 系统错误地把 "UniProt" 当作 SMILES 分子式处理
- 返回了错误的阿司匹林信息

**根本原因**:
```typescript
// src/agents/index.ts:39-45
const smilesMatch = message.match(/[A-Za-z0-9@+\[\]()#%=.]+/);

if (smilesMatch && (
  message.includes('分子') ||
  message.includes('SMILES') ||
  message.includes('PubChem') ||
  message.includes('ChEMBL') ||
  message.includes('功能') ||
  message.includes('查询')
)) {
```

这段代码的问题：
1. 正则表达式太宽泛，会匹配任何单词
2. 没有调用注册的工具 (`uniprot_search`, `pubchem_search` 等)
3. 使用硬编码的 `queryMoleculeFromPublicAPI` 函数，没有利用工具系统

**期望行为**:
- 检测到 "UniProt ID: P04637"
- 调用 `uniprot_search` 工具查询 P04637
- 返回 TP53 蛋白质信息

### 问题 2: 工具注册但未被使用

**位置**: `src/app.ts`

工具已正确注册：
```typescript
// src/app.ts:41-43
registerSCPTools(coreServicesInstance.toolRegistry);
registerLifeScienceTools(coreServicesInstance.toolRegistry);
```

但是 Analysis Agent 的 `processMessage` 没有使用 `toolRegistry`。

## 受影响的工具

### 公开 API 工具 (非 SCP) - 12 个
| 工具名称 | 功能 | 状态 |
|---------|------|------|
| `pubchem_search` | 查询分子化学信息 | ❌ 未被调用 |
| `chembl_search` | 查询生物活性数据 | ❌ 未被调用 |
| `uniprot_search` | 查询蛋白质信息 | ❌ 未被调用 |
| `string_interaction` | 蛋白质相互作用 | ❌ 未被调用 |
| `ensembl_lookup` | 基因组注释 | ❌ 未被调用 |
| `ncbi_esearch` | NCBI 数据库检索 | ❌ 未被调用 |
| `tcga_gdc_search` | 癌症基因组数据 | ❌ 未被调用 |
| `kegg_find` | 代谢通路查询 | ❌ 未被调用 |
| `fda_drug_search` | FDA 药品信息 | ❌ 未被调用 |
| `europe_pmc_search` | 文献检索 | ❌ 未被调用 |
| `ucsc_genome` | 基因组浏览器 | ❌ 未被调用 |
| `blast_search` | 序列比对 | ❌ 未被调用 |

## 解决方案

需要修改 `src/agents/index.ts` 中的 `agentDefToAgent` 函数：

1. **从 toolRegistry 获取工具**: 使用 `getCoreServices().toolRegistry`
2. **意图识别**: 根据用户消息判断应该调用哪个工具
3. **工具调用**: 执行工具的 `execute` 方法

### 代码修改建议

```typescript
// 在 agentDefToAgent 中:
async processMessage(message: string) {
  const coreServices = getCoreServices();
  if (!coreServices) {
    return { content: '服务未初始化', type: 'text' };
  }

  const toolRegistry = coreServices.toolRegistry;

  // 意图识别 -> 工具选择
  if (message.includes('UniProt') || message.includes('蛋白')) {
    const tool = toolRegistry.getTool('uniprot_search');
    if (tool) {
      const result = await tool.execute({ query: extractId(message) }, {});
      return { content: formatResult(result), type: 'text' };
    }
  }
  // ... 其他工具
}
```

## 测试用例

1. 查询蛋白质: "查询 TP53 蛋白的信息" -> 应调用 `uniprot_search`
2. 查询分子: "查询 aspirin 的分子式" -> 应调用 `pubchem_search`
3. 查询药物: "查询阿司匹林的 FDA 信息" -> 应调用 `fda_drug_search`
4. 查询基因: "查询 TP53 基因的 Ensembl 信息" -> 应调用 `ensembl_lookup`

## 下一步

需要修改 `src/agents/index.ts` 中的 Analysis Agent 实现，让它正确集成工具系统。这需要 coder-02 来处理。

---

**Debug 完成时间**: 2026-03-24 15:50
**状态**: 问题已定位，等待修复
