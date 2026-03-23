# VerumOS Debug 日志

## 2026-03-23 调试记录

### ✅ 已修复

#### 1. 时间戳前缀问题
- **修改**: `src/job/manager.ts` - `saveToInputs()` 不再添加时间戳前缀
- **验证**: 文件名保留原名（`count_matrix.csv` 而非 `1774255722874-count_matrix.csv`）

#### 2. 需求文档解析问题
- **修改**: `src/agents/requirement-doc.ts`
  - 正则扩展为 `## 数据(?:来源|源)?`
  - 表格解析支持反引号包裹的文件名
- **验证**: 三个文件都被正确解析到 `datasets` 数组

### ⏳ 待实现

#### 3. 系统不够通用
当前系统只能匹配预定义的分析模式，需要改造为：

**目标架构：**
```
需求文档 → LLM 解析 → 任务分解 → Skill 匹配/代码生成 → 执行 → 验证
```

**具体方案：**

1. **LLM 任务分解器** (`src/agents/task-planner.ts`)
   - 输入：需求文档（markdown）
   - 输出：结构化任务列表（JSON）
   - 每个任务包含：数据依赖、操作类型、参数、预期输出

2. **Skill 匹配器** (`src/agents/skill-matcher.ts`)
   - 扫描已注册的 skills（csv-skill, bioinfo-skill 等）
   - 根据任务类型匹配合适的 skill
   - 如果没有匹配的 skill，标记为"需要代码生成"

3. **代码生成器** (`src/agents/code-generator.ts`)
   - 输入：任务描述 + 数据 schema
   - 输出：可执行的 Python 代码
   - 使用 LLM 生成代码

4. **执行引擎** (`src/runtime/executor.ts`)
   - 依次执行任务
   - 传递中间结果
   - 验证输出

**API 调用流程：**
```
POST /api/execute
{
  "jobId": "xxx",
  "requirement": "# 需求文档..."
}

响应：
{
  "tasks": [...],
  "executionPlan": [...],
  "code": "python code...",
  "outputs": [...]
}
```

### 测试验证

- [x] 上传 3 个 CSV 文件，验证文件名正确保存
- [x] 粘贴需求文档，验证 `datasets` 正确解析
- [ ] 执行需求文档，验证工具链正确生成并执行（LLM API 响应慢，待测试）
- [ ] 验证最终输出 `integrated_data.csv`
