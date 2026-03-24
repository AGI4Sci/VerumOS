# VerumOS TODO List

> 排查时间：2026-03-24
> 排查人：coder-01

## 🔴 P0 - 核心功能缺失

### Model Agent
- **状态**：🚫 未实现
- **问题**：后端逻辑完全未实现，仅前端 UI 存在
- **位置**：
  - 前端：`web/index.html` (Model Agent sidebar)
  - 后端：缺失 `src/agents/model-agent.ts`
- **建议**：确认是否在本阶段实现

### SCP 工具调用
- **状态**：⚠️ 需测试
- **问题**：大部分 SCP 工具标记为"API密钥过期"，实际调用可能失败
- **位置**：
  - 前端：`web/index.html` (SCP_TOOLS 数组)
  - 后端：`src/tools/scp-tool-invoker.ts`, `src/routes/scp.ts`
- **可用工具**：13 个公开 API 工具标记为可用（PubChem、UniProt、ChEMBL 等）
- **不可用工具**：25 个 SCP Hub 服务标记为不可用

### 非 SCP 工具
- **状态**：❓ 待排查
- **问题**：用户反馈工具无法使用
- **位置**：
  - `src/skills/csv-skill.ts`
  - `src/skills/bioinfo-skill.ts`
- **负责人**：@debug-02

---

## 🟡 P1 - 功能待完善

### LongTermMemory
- **状态**：📋 未实现 (Phase 2)
- **位置**：`src/core/memory/long-term-memory.ts`
- **说明**：所有 Agent 的 `longTermMemory.enabled: false`

### Analysis Agent 执行
- **状态**：❓ 待测试
- **问题**：前端 UI 完整，后端实际执行逻辑待验证
- **位置**：`src/agents/analysis-agent.ts`

### 工具池保存
- **状态**：❓ 待测试
- **问题**：选中工具保存后是否真正生效待验证

---

## 🟢 P2 - 已有实现需测试

| 模块 | 位置 | 说明 |
|------|------|------|
| Data Agent + csv-skill | `src/agents/data-agent.ts`, `src/skills/csv-skill.ts` | 完整实现，需端到端测试 |
| bioinfo-skill | `src/skills/bioinfo-skill.ts` | 完整实现，需端到端测试 |
| 需求文档系统 | `src/agents/requirement-doc.ts` | 完整实现，需端到端测试 |
| Job Workspace | `src/job/manager.ts` | 完整实现，需测试任务恢复功能 |
| 快照功能 | `src/snapshot/`, 前端 UI | 前端 UI 完整，需测试回退功能 |

---

## 📝 公开 API 工具清单（可用）

以下工具无需 SCP API 密钥，可直接使用：

| 工具 | 提供方 | 功能 |
|------|--------|------|
| PubChem API | PubChem (公开) | 化学信息查询 |
| ChEMBL API | ChEMBL (公开) | 生物活性数据 |
| FDA API | FDA (公开) | 药品监管信息 |
| KEGG API | KEGG (公开) | 代谢通路 |
| UniProt API | UniProt (公开) | 蛋白质数据库 |
| STRING API | STRING DB (公开) | 蛋白质相互作用 |
| Ensembl API | Ensembl (公开) | 基因组注释 |
| NCBI API | NCBI (公开) | 文献/序列检索 |
| TCGA API | GDC (公开) | 癌症基因组数据 |
| UCSC API | UCSC (公开) | 基因组浏览器 |
| Europe PMC API | Europe PMC (公开) | 文献检索 |
| BLAST API | NCBI (公开) | 序列比对 |

---

## 🚀 建议优先级

1. **P0** - SCP API 连通性测试 (@debug-01)
2. **P0** - 非 SCP 工具排查修复 (@debug-02)
3. **P1** - 端到端测试验证
4. **P2** - 确认 Model Agent 是否本阶段实现
