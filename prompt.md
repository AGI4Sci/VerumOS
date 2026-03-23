# Debug: 文件名时间戳前缀问题修复

## 问题描述
Data Agent 执行分析方案时，无法找到数据文件。需求文档中引用 `cell_metadata.csv`，但实际存储的是 `1774233345040-cell_metadata.csv`（带时间戳前缀）。

## 根因分析
1. **上传流程**: `saveToInputs()` 在保存文件时添加时间戳前缀 `${Date.now()}-${filename}`
2. **需求文档**: 只存储原始文件名 `ds.file = "cell_metadata.csv"`
3. **工具链生成**: `generateToolChain()` 直接使用 `ds.file` 作为路径，导致找不到文件

## 解决方案
在 `requirement-doc.ts` 中添加文件路径解析逻辑：

```typescript
async function resolveActualFilePath(
  originalFileName: string,
  jobId?: string
): Promise<string | null> {
  if (!jobId) {
    return path.resolve(config.data.dir, originalFileName);
  }

  const inputsDir = path.join(config.data.dir, jobId, 'inputs');
  
  try {
    const entries = await fs.readdir(inputsDir);
    // 查找以原始文件名结尾的文件（带时间戳前缀）
    const matchedFile = entries.find(entry => entry.endsWith(`-${originalFileName}`));
    if (matchedFile) {
      return path.join(inputsDir, matchedFile);
    }
  } catch {
    // 目录不存在
  }

  return null;
}
```

## 修改步骤
1. `src/agents/requirement-doc.ts`:
   - 添加 `resolveActualFilePath()` 函数
   - `generateToolChain()` 改为 async，解析实际路径
   - `generatePythonScript()` 改为 async，解析实际路径

2. `src/agents/data-agent.ts`:
   - `handleExecute()` 中 await `generateToolChain()` 和 `generatePythonScript()`
   - `handleRequirementDiscuss()` 中 await `generateToolChain()`

3. `src/routes/requirement.ts`:
   - 所有调用 `generateToolChain()` 的地方添加 await

## 测试验证
### 功能测试
1. 打开 job "001" (已有上传的数据文件)
2. 点击 "▶ 执行" 按钮
3. 验证执行成功：6 个步骤全部完成 ✅

### 结果确认
```bash
ls data/job_20260323_1035_ld12px/outputs/
# execution_summary.md
# step_1_read_file.json
# step_2_read_file.json
# step_3_read_file.json
# step_4_quality_control.json
# step_5_normalize_counts.json
```

生成的 Python 脚本也使用了正确的文件路径：
```python
data_0 = pd.read_csv("data/job_20260323_1035_ld12px/inputs/1774233349208-count_matrix.csv")
```

## 收尾工作
- [x] 代码修改完成
- [x] 功能测试通过
- [x] 文档更新 (prompt.md)
- [ ] Git commit
