# VerumOS 未实现功能 TODO List

> 生成时间: 2026-03-24
> 生成者: coder-02

## 📋 总览

| 分类 | 已实现 | 待实现/修复 | 优先级 |
|------|--------|-------------|--------|
| Agent 系统 | 2/3 | 1 | P1 |
| 公开 API 工具 | 12 | 需测试验证 | P0 |
| SCP 工具 | 0/25 | 25 (需配置API) | P1 |
| 前端功能 | 大部分完成 | 部分优化 | P2 |

---

## 🔴 P0 - 需要立即处理

### 1. 公开 API 工具连通性测试
**现状**: 已实现 12 个公开 API 工具，但未经端到端测试验证
**文件**: `src/tools/life-science-tools.ts`

需要测试的工具：
- [ ] `pubchem_search` - PubChem 分子查询
- [ ] `chembl_search` - ChEMBL 生物活性数据
- [ ] `uniprot_search` - UniProt 蛋白质数据库
- [ ] `string_interaction` - STRING 蛋白质相互作用
- [ ] `ensembl_lookup` - Ensembl 基因组注释
- [ ] `ncbi_esearch` - NCBI 文献/序列搜索
- [ ] `tcga_gdc_search` - TCGA 癌症基因组数据
- [ ] `kegg_find` - KEGG 通路数据库
- [ ] `fda_drug_search` - FDA 药品监管数据
- [ ] `europe_pmc_search` - Europe PMC 文献检索
- [ ] `ucsc_genome` - UCSC 基因组浏览器
- [ ] `blast_search` - BLAST 序列比对

**测试方法**:
```bash
# 启动服务
pnpm dev

# 在网页端测试每个工具
# 例如输入: "查询 TP53 蛋白质的 UniProt 信息"
```

---

## 🟠 P1 - 本阶段需要完成

### 2. SCP 工具连通性测试与修复
**现状**: 
- 前端已列出 25 个 SCP 工具，标记为"API密钥过期"
- 后端有调用代码 `src/routes/scp.ts`，但未配置有效密钥
- 用户提供新密钥: `sk-b0eca789-0a05-4545-ac44-894e018d7503`

**待完成**:
- [ ] 配置 SCP API 密钥到 `.env`
- [ ] 测试 SCP API 连通性 (`GET /api/scp/test`)
- [ ] 验证工具调用 (`POST /api/scp/invoke`)
- [ ] 更新前端工具状态（从"不可用"改为"可用"）

**文件**: 
- `.env` - 配置密钥
- `src/routes/scp.ts` - API 路由
- `web/index.html` - 前端工具列表

### 3. Model Agent 实现
**现状**: 占位实现，只返回"功能开发中"提示

**需要实现**:
- [ ] 模型选择与推荐
- [ ] 超参数调优
- [ ] 训练监控
- [ ] 模型评估
- [ ] 推理部署

**文件**: `src/agents/model-agent.ts`

**建议**: 先实现基础功能，后续迭代增强

---

## 🟡 P2 - 后续优化

### 4. Analysis Agent 增强
**现状**: 基础实现完成，但缺少：
- [ ] 实际的统计分析工具执行
- [ ] 可视化图表生成代码
- [ ] 与 SCP 工具的真实调用集成

**文件**: `src/agents/analysis-agent.ts`

### 5. 前端工具池优化
**现状**: 
- 工具列表完整（25 个 SCP + 12 个公开 API）
- 分类过滤、搜索、批量选择已实现

**待优化**:
- [ ] 工具状态实时同步（与后端一致）
- [ ] 工具调用结果展示优化
- [ ] 工具使用历史记录

### 6. LongTermMemory 实现
**现状**: 接口预留，未实现向量检索

**待实现**:
- [ ] 向量数据库集成（如 Chroma/Pinecone）
- [ ] 语义检索功能
- [ ] 记忆持久化

**文件**: `src/core/memory/long-term-memory.ts`

---

## 📊 详细分析

### Agent 系统状态

| Agent | 状态 | 完成度 | 说明 |
|-------|------|--------|------|
| Data Agent | ✅ 已实现 | 90% | 数据探索、清洗、整合完整 |
| Analysis Agent | 🟡 部分实现 | 60% | 工具池完整，调用逻辑待验证 |
| Model Agent | ❌ 占位 | 5% | 仅提示"开发中" |

### 工具系统状态

| 类型 | 已实现 | 待验证 | 不可用 |
|------|--------|--------|--------|
| 公开 API | 12 | 12 | 0 |
| SCP 工具 | 25 | 0 | 25 |
| 本地工具 (csv/bioinfo) | ~10 | ✅ 已验证 | 0 |

### 前端功能状态

| 功能 | 状态 | 说明 |
|------|------|------|
| Job Explorer | ✅ | 文件树、快照管理完整 |
| 聊天界面 | ✅ | 消息编辑、历史恢复完整 |
| 需求文档 | ✅ | Markdown 编辑、工具链生成 |
| 工具池 | 🟡 | 展示完整，调用待验证 |
| 数据预览 | ✅ | 表格预览完整 |

---

## 🧪 测试验证清单

### 必须通过的测试

1. **公开 API 工具测试**
   - [ ] PubChem 查询阿司匹林分子信息
   - [ ] UniProt 查询 TP53 蛋白质
   - [ ] NCBI 搜索 CRISPR 相关文献
   - [ ] KEGG 查询糖酵解通路

2. **SCP 工具测试**（密钥配置后）
   - [ ] 连通性测试 `/api/scp/test`
   - [ ] DrugSDA-Tool 分子格式转换
   - [ ] VenusFactory 蛋白质突变预测

3. **回归测试**
   - [ ] 文件上传功能
   - [ ] Data Agent 数据探索
   - [ ] 需求文档保存/执行
   - [ ] 快照创建/回退

---

## 📝 下一步行动建议

1. **gzy** 提供了新的 SCP API 密钥，优先验证 SCP 工具连通性
2. **debug-02** 负责验证公开 API 工具，确保 12 个工具都能正常工作
3. **debug-03 + coder** 讨论是否需要立即实现 Model Agent，还是先完善 Analysis Agent

---

## 🔗 相关文件

- `README.md` - 项目文档
- `prompt.md` - 开发方案
- `tool.md` - SCP Hub 工具清单
- `src/tools/life-science-tools.ts` - 公开 API 工具实现
- `src/routes/scp.ts` - SCP 工具路由
- `src/agents/model-agent.ts` - Model Agent 占位代码
