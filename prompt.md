# VerumOS Phase 1 · Data Agent 完整实现

## 背景

VerumOS 是科研 AI 操作系统，Data Agent 是三大核心 Agent 之一，负责数据搜集、探索、清洗、整合。

当前已有基础框架，需要增强为完整的、可生产使用的 Data Agent。

## 核心需求

### 1. 需求文档驱动的工作流

用户上传数据后，Data Agent 需要：
- 读取初始需求文档（如 `data/需求文档_单细胞分析.md`）
- 与用户讨论需求，提问直到能执行
- 动态更新需求文档，保存为 `.md` 格式
- 根据最终文档选择工具链执行

需求文档格式示例：
```markdown
# 需求文档_单细胞分析

## 数据源
| 文件 | 类型 | 描述 |
|------|------|------|
| count_matrix.csv | 表达矩阵 | gene × cell |
| cell_metadata.csv | 元数据 | 细胞信息 |
| gene_annotation.csv | 注释 | 基因信息 |

## 目标
细胞类型鉴定

## 分析方案
1. 加载表达矩阵并转置为 cell × gene
2. 用 cell_barcode 关联 metadata
3. 执行 QC 过滤

## 状态
- [x] 数据已上传
- [ ] 需求讨论中
- [ ] 执行中
- [ ] 完成
```

### 2. Skill 系统

#### csv-skill（现有，增强）
操作：
- `read_file`: 读取 CSV/Excel
- `explore_data`: 数据探索
- `transform_data`: 数据转换（filter, normalize, log2）
- `merge_data`: 合并数据集
- `transpose`: **新增** - 矩阵转置

#### bioinfo-skill（新建）
操作：
- `read_expression_matrix`: 读取单细胞表达矩阵，自动处理 gene × cell 或 cell × gene
- `quality_control`: QC 过滤（n_genes, pct_mito 阈值）
- `normalize_counts`: 标准化（CPM, TPM, log1p）
- `find_markers`: 寻找 marker 基因

### 3. 前端增强

当前 `web/index.html` 需要增加：

#### 数据预览表格
- 显示已加载数据集的前 20 行
- 支持横向滚动（宽表）
- 列类型标注（numeric/categorical）

#### 需求文档编辑器
- 右侧面板显示当前需求文档
- 支持 Markdown 渲染 + 编辑
- 实时保存到服务器

#### 方案预览栏
- 显示 Agent 推荐的工具链
- 用户可以确认或修改

### 4. LLM 配置

使用中转站 API：
- base_url: http://35.220.164.252:3888/v1/
- model: glm-5
- api_key: 从环境变量读取

**安全要求**：
- `config.ts` 从 `process.env.LLM_API_KEY` 读取
- 新建 `.env.example` 提供模板
- `.gitignore` 排除 `.env` 文件

### 5. 会话状态持久化

当前会话存储在内存，需要：
- 支持刷新页面后恢复会话
- 需求文档与会话绑定

## 实现步骤

### Step 1: 配置与安全
1. 修改 `src/config.ts`，从环境变量读取 API key
2. 创建 `.env.example` 和 `.env`（本地）
3. 更新 `.gitignore`

### Step 2: bioinfo-skill
1. 创建 `src/skills/bioinfo-skill.ts`
2. 实现 `read_expression_matrix`, `quality_control`, `normalize_counts`
3. 在 `src/skills/index.ts` 注册

### Step 3: 需求文档系统
1. 创建 `src/agents/requirement-doc.ts` 管理需求文档
2. 新增 API：`GET/POST /api/requirement/:sessionId`
3. Data Agent 在处理消息时读取/更新需求文档

### Step 4: 前端增强
1. 重构 `web/index.html`：
   - 左侧：数据集面板 + 聊天区
   - 右侧：需求文档编辑器 + 方案预览
2. 新增数据预览表格组件
3. 新增 Markdown 编辑器（可用 textarea + 实时渲染）

### Step 5: Data Agent 增强
1. 增强 `analyzeIntent` 支持需求文档场景
2. 新增 `handleRequirementDiscuss` 处理需求讨论
3. 新增 `generateToolChain` 根据需求文档生成工具链

### Step 6: 测试数据
使用 `data/` 目录下的示例数据：
- `count_matrix.csv`: 12 genes × 20 cells
- `cell_metadata.csv`: 20 cells metadata
- `gene_annotation.csv`: 12 genes annotation
- `需求文档_单细胞分析.md`: 初始需求

## 技术约束

- 后端：TypeScript + Hono
- 前端：原生 HTML/CSS/JS（不用框架）
- Python 执行：使用 `/opt/homebrew/Caskroom/miniconda/base/bin/python`
- 不引入新的 npm 依赖（除非必要）

## 验收标准

1. 用户上传 `data/count_matrix.csv`，Agent 自动识别为表达矩阵
2. 用户输入"我想做细胞类型鉴定"，Agent 读取需求文档并与用户讨论
3. 用户确认方案后，Agent 调用 bioinfo-skill 执行
4. 前端显示数据预览表格 + 需求文档
5. API key 不出现在 git 提交中

## 工作结束后必需

修改相关文件和 README.md，使得项目状态与描述一致，最后 push 到 git。
