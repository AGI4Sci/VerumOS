import path from 'node:path';
import { localExecutor } from '../execution/local.js';
import { BaseSkill } from './base.js';
import type { SkillCapabilities, SkillDependencies, ToolDefinition } from './types.js';

export class BioinfoSkill extends BaseSkill {
  name = 'bioinfo-skill';
  displayName = '生物信息学分析';
  description = '单细胞表达矩阵处理、QC、标准化、marker 基因分析';
  version = '1.0.0';
  category = 'bioinfo' as const;

  capabilities: SkillCapabilities = {
    formats: ['.csv', '.tsv', '.h5ad', '.mtx'],
    operations: ['read_expression_matrix', 'quality_control', 'normalize_counts', 'find_markers'],
  };

  dependencies: SkillDependencies = {
    python: ['pandas', 'numpy', 'scanpy'],
  };

  tools: ToolDefinition[] = [
    {
      name: 'read_expression_matrix',
      description: '读取单细胞表达矩阵，自动处理 gene × cell 或 cell × gene 格式',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '表达矩阵文件路径' },
          format: { type: 'string', description: '矩阵格式: gene_cell 或 cell_gene' },
        },
        required: ['path'],
      },
    },
    {
      name: 'quality_control',
      description: '执行 QC 过滤，支持 n_genes 和 pct_mito 阈值',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '表达矩阵文件路径' },
          min_genes: { type: 'number', description: '最小基因数阈值，默认 200' },
          max_genes: { type: 'number', description: '最大基因数阈值，可选' },
          max_mito_pct: { type: 'number', description: '最大线粒体基因百分比，默认 20' },
        },
        required: ['path'],
      },
    },
    {
      name: 'normalize_counts',
      description: '标准化表达矩阵，支持 CPM、TPM、log1p 等方法',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '表达矩阵文件路径' },
          method: { type: 'string', description: '标准化方法: cpm, tpm, log1p, scanpy' },
        },
        required: ['path', 'method'],
      },
    },
    {
      name: 'find_markers',
      description: '寻找 marker 基因',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '表达矩阵文件路径' },
          n_markers: { type: 'number', description: '每个 cluster 返回的 marker 数量，默认 10' },
        },
        required: ['path'],
      },
    },
  ];

  async checkDependencies(): Promise<boolean> {
    const pandasReady = await localExecutor.checkPythonPackage('pandas');
    const numpyReady = await localExecutor.checkPythonPackage('numpy');
    return pandasReady && numpyReady;
  }

  async execute(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'read_expression_matrix':
        return this.runPython(this.generateReadExpressionMatrixCode(String(params.path || ''), params.format as string | undefined));
      case 'quality_control':
        return this.runPython(
          this.generateQualityControlCode(
            String(params.path || ''),
            (params.min_genes as number) ?? 200,
            (params.max_mito_pct as number) ?? 20,
            params.max_genes as number | undefined
          )
        );
      case 'normalize_counts':
        return this.runPython(
          this.generateNormalizeCode(
            String(params.path || ''),
            String(params.method || 'log1p')
          )
        );
      case 'find_markers':
        return this.runPython(
          this.generateFindMarkersCode(
            String(params.path || ''),
            (params.n_markers as number) ?? 10
          )
        );
      default:
        throw new Error(`Unsupported bioinfo-skill tool: ${toolName}`);
    }
  }

  private async runPython(code: string): Promise<unknown> {
    const result = await localExecutor.executePython(code);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || 'Python execution failed');
    }
    return JSON.parse(result.stdout);
  }

  private generateReadExpressionMatrixCode(filePath: string, format?: string): string {
    return `${this.pythonPrelude()}

file_path = ${JSON.stringify(filePath)}
format_hint = ${JSON.stringify(format || '')}

df = read_table(file_path)

# 自动检测矩阵格式
n_rows, n_cols = df.shape
first_col = df.columns[0] if len(df.columns) > 0 else ''

# 判断是否为 gene × cell 格式
if format_hint == 'gene_cell':
    is_gene_cell = True
elif format_hint == 'cell_gene':
    is_gene_cell = False
else:
    # 自动检测：如果第一列看起来像基因名，且列数远大于行数，可能是 gene × cell
    gene_patterns = ['gene', 'Gene', 'GENE', 'symbol', 'Symbol', 'ensembl', 'ENSG']
    first_col_is_gene = any(p in str(first_col) for p in gene_patterns)
    is_gene_cell = first_col_is_gene or (n_cols > n_rows * 2)

if is_gene_cell:
    # gene × cell 格式，需要转置
    gene_col = df.columns[0]
    genes = df[gene_col].tolist()
    df = df.drop(columns=[gene_col])
    df.index = genes
    df = df.T  # 转置为 cell × gene
    matrix_format = 'gene_cell (transposed to cell_gene)'
else:
    matrix_format = 'cell_gene'

preview_df = df.head(5).where(pd.notna(df.head(5)), None)
result = {
    "path": file_path,
    "format": matrix_format,
    "shape": {"cells": int(len(df)), "genes": int(len(df.columns))},
    "cells": df.index.tolist()[:10],
    "genes": df.columns.tolist()[:10],
    "preview": preview_df.to_dict(orient="records")
}
print(json.dumps(result, ensure_ascii=False))
`;
  }

  private generateQualityControlCode(filePath: string, minGenes: number, maxMitoPct: number, maxGenes?: number): string {
    return `${this.pythonPrelude()}

file_path = ${JSON.stringify(filePath)}
min_genes = ${minGenes}
max_genes = ${maxGenes ?? 'None'}
max_mito_pct = ${maxMitoPct}

df = read_table(file_path)

# 检测是否需要转置
n_rows, n_cols = df.shape
if n_cols > n_rows * 2:
    # 可能是 gene × cell，转置
    gene_col = df.columns[0]
    df = df.drop(columns=[gene_col])
    df = df.T

# 计算 QC 指标
n_genes_per_cell = (df > 0).sum(axis=1)

# 尝试识别线粒体基因
mito_genes = [g for g in df.columns if g.upper().startswith('MT-') or g.upper().startswith('MT_')]
if mito_genes:
    mito_counts = df[mito_genes].sum(axis=1)
    total_counts = df.sum(axis=1)
    pct_mito = (mito_counts / total_counts * 100).fillna(0)
else:
    pct_mito = pd.Series([0] * len(df), index=df.index)

# 应用过滤
mask = n_genes_per_cell >= min_genes
if max_genes is not None:
    mask = mask & (n_genes_per_cell <= max_genes)
mask = mask & (pct_mito <= max_mito_pct)

filtered_df = df[mask]

result = {
    "path": file_path,
    "original_cells": int(len(df)),
    "filtered_cells": int(len(filtered_df)),
    "removed_cells": int(len(df) - len(filtered_df)),
    "qc_metrics": {
        "min_genes": min_genes,
        "max_genes": max_genes,
        "max_mito_pct": max_mito_pct,
        "mito_genes_found": len(mito_genes)
    },
    "n_genes_stats": {
        "mean": float(n_genes_per_cell.mean()),
        "median": float(n_genes_per_cell.median()),
        "min": int(n_genes_per_cell.min()),
        "max": int(n_genes_per_cell.max())
    }
}
print(json.dumps(result, ensure_ascii=False))
`;
  }

  private generateNormalizeCode(filePath: string, method: string): string {
    return `${this.pythonPrelude()}

file_path = ${JSON.stringify(filePath)}
method = ${JSON.stringify(method)}

df = read_table(file_path)

# 检测是否需要转置
n_rows, n_cols = df.shape
if n_cols > n_rows * 2:
    gene_col = df.columns[0]
    df = df.drop(columns=[gene_col])
    df = df.T

if method == 'cpm':
    # Counts per million
    total_counts = df.sum(axis=1)
    total_counts = total_counts.replace(0, 1)  # 避免除零
    normalized = df.div(total_counts, axis=0) * 1e6
elif method == 'tpm':
    # TPM (简化版，假设基因长度相同)
    total_counts = df.sum(axis=1)
    total_counts = total_counts.replace(0, 1)
    normalized = df.div(total_counts, axis=0) * 1e6
elif method == 'log1p':
    # Log1p 变换
    normalized = np.log1p(df)
elif method == 'scanpy':
    # Scanpy 风格标准化
    total_counts = df.sum(axis=1)
    total_counts = total_counts.replace(0, 1)
    normalized = df.div(total_counts, axis=0) * 1e4
    normalized = np.log1p(normalized)
else:
    normalized = df

preview_df = normalized.head(5).where(pd.notna(normalized.head(5)), None)
result = {
    "path": file_path,
    "method": method,
    "shape": {"cells": int(len(normalized)), "genes": int(len(normalized.columns))},
    "preview": preview_df.to_dict(orient="records")
}
print(json.dumps(result, ensure_ascii=False))
`;
  }

  private generateFindMarkersCode(filePath: string, nMarkers: number): string {
    return `${this.pythonPrelude()}

file_path = ${JSON.stringify(filePath)}
n_markers = ${nMarkers}

df = read_table(file_path)

# 检测是否需要转置
n_rows, n_cols = df.shape
if n_cols > n_rows * 2:
    gene_col = df.columns[0]
    df = df.drop(columns=[gene_col])
    df = df.T

# 简化版 marker 基因检测：基于平均表达量
# 实际应用中应使用 scanpy.tl.rank_genes_groups
gene_means = df.mean().sort_values(ascending=False)
gene_vars = df.var()
gene_stats = pd.DataFrame({
    'gene': gene_means.index,
    'mean': gene_means.values,
    'var': gene_vars[gene_means.index].values
})
gene_stats['score'] = gene_stats['mean'] / (gene_stats['var'] + 1e-6)
top_markers = gene_stats.nlargest(n_markers, 'score')

result = {
    "path": file_path,
    "n_markers": n_markers,
    "markers": [
        {"gene": row['gene'], "mean": float(row['mean']), "score": float(row['score'])}
        for _, row in top_markers.iterrows()
    ]
}
print(json.dumps(result, ensure_ascii=False))
`;
  }

  private pythonPrelude(): string {
    return `import json
import pandas as pd
import numpy as np

def read_table(path):
    ext = path.lower().split('.')[-1] if '.' in path else ''
    if ext == 'tsv':
        return pd.read_csv(path, sep='\\t', index_col=0)
    if ext in ('xlsx', 'xls'):
        return pd.read_excel(path, index_col=0)
    return pd.read_csv(path, index_col=0)
`;
  }
}

export const bioinfoSkill = new BioinfoSkill();