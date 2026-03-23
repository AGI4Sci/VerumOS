/**
 * 快照类型定义
 *
 * 快照保存的是"决策点"，不是"数据备份"
 * - ✅ job.json: 核心状态机 + 对话历史
 * - ✅ requirement.md: AI 的理解/决策
 * - ✅ analysis.py: AI 生成的代码
 * - ❌ inputs/: 原始数据，不变，体积可能很大
 * - ❌ outputs/: 可从代码重新生成
 */

/**
 * 快照触发类型
 */
export type SnapshotTrigger = 'execute' | 'chat' | 'edit' | 'manual';

/**
 * 快照时机
 */
export type SnapshotPhase = 'pre' | 'post';

/**
 * 快照定义
 */
export interface Snapshot {
  /** 快照 ID，格式：snap_序号_时机 */
  id: string;
  /** 序号（递增） */
  sequence: number;
  /** 时间戳 */
  timestamp: string;
  /** 时机：pre（操作前）或 post（操作后） */
  phase: SnapshotPhase;
  /** 触发动作 */
  trigger: SnapshotTrigger;
  /** 用户标签（可选） */
  label?: string;
  /** 快照文件内容 */
  files: {
    jobJson?: string;        // job.json 内容
    requirementMd?: string;  // requirement.md 内容
    analysisPy?: string;     // analysis.py 内容
  };
  /** 关联的 pre 快照 ID（post 快照专用） */
  preSnapshotId?: string;
  /** 摘要（用于列表展示） */
  summary?: string;
}

/**
 * 创建快照选项
 */
export interface CreateSnapshotOptions {
  jobId: string;
  phase: SnapshotPhase;
  trigger: SnapshotTrigger;
  label?: string;
  preSnapshotId?: string;
}

/**
 * 快照差异
 */
export interface SnapshotDiff {
  snapshotId: string;
  previousSnapshotId?: string;
  changes: {
    file: string;
    type: 'added' | 'modified' | 'deleted';
    diff?: string;  // 简单的 diff 描述
  }[];
}
