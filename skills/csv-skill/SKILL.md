---
name: csv-skill
displayName: CSV/Excel 数据处理
description: "处理 CSV 和 Excel 文件：读取、探索、转换、合并、转置"
version: "1.0.0"
category: data-io
metadata:
  formats: [".csv", ".tsv", ".xlsx", ".xls"]
  operations: [read, explore, transform, merge, transpose]
---

# CSV Skill

处理表格数据文件（CSV、TSV、Excel）。

## 工具

### read_file

读取数据文件并返回基本信息：shape、columns、preview。

### explore_data

输出更完整的探索结果：statistics、missing、quality、preview。

### transform_data

支持 `filter`、`normalize`、`log2` 等基础操作。

### merge_data

按 `on` 字段合并多个数据集。

### transpose

矩阵转置，交换行和列。
