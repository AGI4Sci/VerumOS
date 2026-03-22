import path from 'node:path';
import { localExecutor } from '../execution/local.js';
import { BaseSkill } from './base.js';
import type { SkillCapabilities, SkillDependencies, ToolDefinition } from './types.js';

export class CSVSkill extends BaseSkill {
  name = 'csv-skill';
  displayName = 'CSV/Excel 数据处理';
  description = '读取并探索 CSV、TSV、Excel 文件';
  version = '1.0.0';
  category = 'data-io' as const;

  capabilities: SkillCapabilities = {
    formats: ['.csv', '.tsv', '.xlsx', '.xls'],
    operations: ['read', 'explore', 'transform', 'merge', 'transpose'],
  };

  dependencies: SkillDependencies = {
    python: ['pandas', 'openpyxl'],
  };

  tools: ToolDefinition[] = [
    {
      name: 'read_file',
      description: '读取 CSV/TSV/Excel 文件并返回基本概览',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    },
    {
      name: 'explore_data',
      description: '输出结构化的数据探索结果',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    },
    {
      name: 'transform_data',
      description: '执行简单的数据转换',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          operation: { type: 'string' },
          params: { type: 'object' },
        },
        required: ['path', 'operation'],
      },
    },
    {
      name: 'merge_data',
      description: '按指定键合并多个表格数据集',
      parameters: {
        type: 'object',
        properties: {
          paths: { type: 'array' },
          on: { type: 'string' },
          how: { type: 'string' },
        },
        required: ['paths', 'on'],
      },
    },
    {
      name: 'transpose',
      description: '矩阵转置，交换行和列',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    },
  ];

  async checkDependencies(): Promise<boolean> {
    const pandasReady = await localExecutor.checkPythonPackage('pandas');
    return pandasReady;
  }

  async execute(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'read_file':
        return this.runPython(this.generateReadCode(String(params.path || '')));
      case 'explore_data':
        return this.runPython(this.generateExploreCode(String(params.path || '')));
      case 'transform_data':
        return this.runPython(
          this.generateTransformCode(
            String(params.path || ''),
            String(params.operation || ''),
            (params.params as Record<string, unknown> | undefined) || {}
          )
        );
      case 'merge_data':
        return this.runPython(
          this.generateMergeCode(
            (params.paths as string[]) || [],
            String(params.on || ''),
            String(params.how || 'inner')
          )
        );
      case 'transpose':
        return this.runPython(this.generateTransposeCode(String(params.path || '')));
      default:
        throw new Error(`Unsupported csv-skill tool: ${toolName}`);
    }
  }

  private async runPython(code: string): Promise<unknown> {
    const result = await localExecutor.executePython(code);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || 'Python execution failed');
    }
    return JSON.parse(result.stdout);
  }

  private generateReadCode(filePath: string): string {
    return `${this.pythonPrelude(filePath)}

df = read_table(file_path)
preview_df = df.head(5).where(pd.notna(df.head(5)), None)
result = {
  "path": file_path,
  "shape": {"rows": int(len(df)), "columns": int(len(df.columns))},
  "columns": build_columns(df)[:50],
  "preview": preview_df.to_dict(orient="records")
}
print(json.dumps(result, ensure_ascii=False))
`;
  }

  private generateExploreCode(filePath: string): string {
    return `${this.pythonPrelude(filePath)}

df = read_table(file_path)
preview_df = df.head(5).where(pd.notna(df.head(5)), None)
numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
non_numeric_cols = [col for col in df.columns.tolist() if col not in numeric_cols]

numeric_stats = {}
for col in numeric_cols[:10]:
  series = df[col].dropna()
  numeric_stats[str(col)] = {
    "mean": safe_float(series.mean()),
    "std": safe_float(series.std()),
    "min": safe_float(series.min()),
    "max": safe_float(series.max())
  }

categorical_stats = {}
for col in non_numeric_cols[:10]:
  series = df[col].dropna().astype(str)
  mode = series.mode()
  categorical_stats[str(col)] = {
    "unique": int(df[col].nunique(dropna=True)),
    "top": None if mode.empty else str(mode.iloc[0])
  }

result = {
  "path": file_path,
  "shape": {"rows": int(len(df)), "columns": int(len(df.columns))},
  "columns": build_columns(df),
  "statistics": {
    "numeric": numeric_stats,
    "categorical": categorical_stats
  },
  "missing": {str(key): int(value) for key, value in df.isna().sum().to_dict().items()},
  "quality": {
    "duplicates": int(df.duplicated().sum())
  },
  "preview": preview_df.to_dict(orient="records")
}
print(json.dumps(result, ensure_ascii=False))
`;
  }

  private generateTransformCode(filePath: string, operation: string, params: Record<string, unknown>): string {
    const op = JSON.stringify(operation);
    const serializedParams = JSON.stringify(params);
    return `${this.pythonPrelude(filePath)}

params = json.loads(${JSON.stringify(serializedParams)})
df = read_table(file_path)
operation = ${op}

if operation == "filter":
  column = str(params.get("column", ""))
  value = str(params.get("value", ""))
  if column and value and column in df.columns:
    df = df[df[column].astype(str).str.contains(value, na=False)]
elif operation == "normalize":
  numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
  for col in numeric_cols:
    std = df[col].std()
    if std and not pd.isna(std) and std != 0:
      df[col] = (df[col] - df[col].mean()) / std
elif operation == "log2":
  numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
  for col in numeric_cols:
    df[col] = np.log2(df[col].clip(lower=0) + 1)

preview_df = df.head(5).where(pd.notna(df.head(5)), None)
result = {
  "success": True,
  "shape": {"rows": int(len(df)), "columns": int(len(df.columns))},
  "preview": preview_df.to_dict(orient="records")
}
print(json.dumps(result, ensure_ascii=False))
`;
  }

  private generateMergeCode(filePaths: string[], on: string, how: string): string {
    const fileList = JSON.stringify(filePaths);
    return `${this.pythonPrelude('')}

paths = json.loads(${JSON.stringify(fileList)})
on = ${JSON.stringify(on)}
how = ${JSON.stringify(how || 'inner')}
frames = [read_table(path) for path in paths]
if len(frames) < 2:
  raise ValueError("merge_data requires at least two files")

result_df = frames[0]
for frame in frames[1:]:
  result_df = result_df.merge(frame, on=on, how=how)

preview_df = result_df.head(5).where(pd.notna(result_df.head(5)), None)
result = {
  "success": True,
  "shape": {"rows": int(len(result_df)), "columns": int(len(result_df.columns))},
  "columns": build_columns(result_df),
  "preview": preview_df.to_dict(orient="records")
}
print(json.dumps(result, ensure_ascii=False))
`;
  }

  private generateTransposeCode(filePath: string): string {
    return `${this.pythonPrelude(filePath)}

df = read_table(file_path)
transposed = df.T
transposed.columns = transposed.columns.astype(str)

preview_df = transposed.head(5).where(pd.notna(transposed.head(5)), None)
result = {
  "success": True,
  "original_shape": {"rows": int(len(df)), "columns": int(len(df.columns))},
  "transposed_shape": {"rows": int(len(transposed)), "columns": int(len(transposed.columns))},
  "columns": build_columns(transposed),
  "preview": preview_df.to_dict(orient="records")
}
print(json.dumps(result, ensure_ascii=False))
`;
  }

  private pythonPrelude(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return `import json
import pandas as pd
import numpy as np

file_path = ${JSON.stringify(filePath)}
file_ext = ${JSON.stringify(ext)}

def read_table(path):
    ext = path.lower().split('.')[-1] if '.' in path else ''
    # 编码回退列表：先尝试 UTF-8，再尝试常见中文编码
    encodings = ['utf-8', 'gbk', 'gb2312', 'latin1']

    if ext == 'tsv':
        for enc in encodings:
            try:
                return pd.read_csv(path, sep='\\t', encoding=enc)
            except UnicodeDecodeError:
                continue
        # 所有编码都失败，用 errors='replace' 强制读取
        return pd.read_csv(path, sep='\\t', encoding='utf-8', errors='replace')

    if ext in ('xlsx', 'xls'):
        return pd.read_excel(path)

    # CSV 文件
    for enc in encodings:
        try:
            return pd.read_csv(path, encoding=enc)
        except UnicodeDecodeError:
            continue
    # 所有编码都失败，用 errors='replace' 强制读取
    return pd.read_csv(path, encoding='utf-8', errors='replace')

def safe_float(value):
    if pd.isna(value):
        return None
    return float(value)

def build_columns(df):
    columns = []
    for column in df.columns.tolist():
        series = df[column]
        dtype = str(series.dtype)
        if pd.api.types.is_numeric_dtype(series):
            col_type = 'numeric'
        elif pd.api.types.is_bool_dtype(series):
            col_type = 'boolean'
        elif pd.api.types.is_datetime64_any_dtype(series):
            col_type = 'datetime'
        else:
            col_type = 'categorical'
        columns.append({
            'name': str(column),
            'type': col_type if dtype == 'object' else dtype,
            'unique': int(series.nunique(dropna=True)),
            'nullable': bool(series.isna().any())
        })
    return columns
`;
  }
}

export const csvSkill = new CSVSkill();
