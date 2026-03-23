/**
 * Job Memory - Job 结构化状态注入
 *
 * 职责：
 * - 从 job.json 读取结构化状态
 * - 以格式化文本块的形式注入 context
 * - 包含：数据集元信息、需求文档、最近 N 条执行轨迹
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { 
  JobMemoryPolicy, 
  DatasetInfo, 
  RequirementDocument, 
  TraceEntry,
  Job,
  JobState
} from '../types.js';
import { config } from '../../config.js';

/**
 * 默认 JobMemory 策略
 */
const DEFAULT_POLICY: JobMemoryPolicy = {
  includeDatasetMeta: true,
  includeRequirementDoc: true,
  includeRecentTraces: 5,
};

export class JobMemory {
  private policy: JobMemoryPolicy;
  private dataDir: string;

  constructor(policy?: JobMemoryPolicy, dataDir?: string) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
    this.dataDir = dataDir || config.data.dir;
  }

  /**
   * 从 job.json 读取结构化状态并格式化为文本
   */
  async assemble(jobId: string): Promise<string | null> {
    const job = await this.loadJob(jobId);
    if (!job) {
      return null;
    }

    const sections: string[] = [];

    // 数据集元信息
    if (this.policy.includeDatasetMeta && job.state.datasets.length > 0) {
      sections.push(this.formatDatasets(job.state.datasets));
    }

    // 需求文档
    if (this.policy.includeRequirementDoc && job.state.requirementDocument) {
      sections.push(this.formatRequirement(job.state.requirementDocument));
    }

    // 执行轨迹
    if (this.policy.includeRecentTraces && job.traces.length > 0) {
      sections.push(this.formatTraces(job.traces.slice(-this.policy.includeRecentTraces)));
    }

    if (sections.length === 0) {
      return null;
    }

    return `## 当前任务上下文\n\n${sections.join('\n\n')}`;
  }

  /**
   * 加载 Job
   */
  private async loadJob(jobId: string): Promise<Job | null> {
    try {
      const jobPath = path.join(this.dataDir, jobId, 'job.json');
      const content = await fs.readFile(jobPath, 'utf-8');
      return JSON.parse(content) as Job;
    } catch {
      return null;
    }
  }

  /**
   * 格式化数据集元信息
   */
  formatDatasets(datasets: DatasetInfo[]): string {
    const lines: string[] = ['### 数据集', '', '| 名称 | 格式 | 行数 | 列数 |', '|------|------|------|------|'];

    for (const ds of datasets) {
      const rows = ds.metadata?.shape?.rows ?? '-';
      const cols = ds.metadata?.shape?.columns ?? '-';
      lines.push(`| ${ds.name} | ${ds.format} | ${rows} | ${cols} |`);
    }

    return lines.join('\n');
  }

  /**
   * 格式化需求文档
   */
  formatRequirement(requirement: RequirementDocument): string {
    const lines: string[] = ['### 需求文档', ''];

    lines.push(`**状态**: ${this.formatStatus(requirement.status)}`);
    lines.push('');

    if (requirement.datasets.length > 0) {
      lines.push('**数据源**:');
      for (const ds of requirement.datasets) {
        lines.push(`- ${ds.file}${ds.description ? `: ${ds.description}` : ''}`);
      }
      lines.push('');
    }

    if (requirement.processingGoal) {
      lines.push(`**处理目标**: ${requirement.processingGoal}`);
      lines.push('');
    }

    if (requirement.outputRequirements) {
      lines.push('**输出要求**:');
      if (requirement.outputRequirements.format) {
        lines.push(`- 格式: ${requirement.outputRequirements.format}`);
      }
      if (requirement.outputRequirements.filename) {
        lines.push(`- 文件名: ${requirement.outputRequirements.filename}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 格式化执行轨迹
   */
  formatTraces(traces: TraceEntry[]): string {
    const lines: string[] = ['### 最近执行记录', ''];

    for (const trace of traces) {
      const time = new Date(trace.timestamp).toLocaleTimeString('zh-CN');
      const icon = trace.type === 'tool_call' ? '🔧' : trace.type === 'tool_result' ? '✅' : '💬';
      lines.push(`${icon} [${time}] ${trace.type}`);
      if (trace.data.tool) {
        lines.push(`   工具: ${trace.data.tool}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 格式化状态
   */
  private formatStatus(status: string): string {
    const statusMap: Record<string, string> = {
      draft: '📝 草稿',
      discussing: '💬 讨论中',
      confirmed: '✅ 已确认',
      executing: '⏳ 执行中',
      completed: '✅ 已完成',
    };
    return statusMap[status] || status;
  }

  /**
   * 更新策略
   */
  setPolicy(policy: Partial<JobMemoryPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }
}

/**
 * 创建默认的 JobMemory
 */
export function createJobMemory(policy?: JobMemoryPolicy, dataDir?: string): JobMemory {
  return new JobMemory(policy, dataDir);
}
