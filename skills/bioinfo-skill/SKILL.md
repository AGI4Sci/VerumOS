---
name: bioinfo-skill
displayName: 生物信息学分析
description: 单细胞表达矩阵处理、QC、标准化、marker 基因分析
version: 1.0.0
category: bioinfo
metadata:
  formats:
    - .csv
    - .tsv
    - .h5ad
    - .mtx
  operations:
    - read_expression_matrix
    - quality_control
    - normalize_counts
    - find_markers
---

# bioinfo-skill

生物信息学分析技能，专注于单细胞转录组数据处理。

## 操作说明

### read_expression_matrix

读取单细胞表达矩阵，自动检测并处理 gene × cell 或 cell × gene 格式。

参数：
- `path`: 表达矩阵文件路径
- `format`: 可选，指定矩阵格式 `gene_cell` 或 `cell_gene`

### quality_control

执行 QC 过滤，基于基因数和线粒体基因百分比。

参数：
- `path`: 表达矩阵文件路径
- `min_genes`: 最小基因数阈值，默认 200
- `max_genes`: 最大基因数阈值，可选
- `max_mito_pct`: 最大线粒体基因百分比，默认 20

### normalize_counts

标准化表达矩阵。

参数：
- `path`: 表达矩阵文件路径
- `method`: 标准化方法
  - `cpm`: Counts per million
  - `tpm`: TPM (简化版)
  - `log1p`: Log1p 变换
  - `scanpy`: Scanpy 风格标准化

### find_markers

寻找 marker 基因（简化版，基于表达量排序）。

参数：
- `path`: 表达矩阵文件路径
- `n_markers`: 每个 cluster 返回的 marker 数量，默认 10

## 依赖

- Python 3.x
- pandas
- numpy
- scanpy (可选，用于更高级的分析)