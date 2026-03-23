/**
 * Core Module Entry - Core 模块入口
 *
 * 提供 Core 服务的创建和初始化。
 */

import type { MemoryPolicy } from './types.js';
import { createMemoryManager } from './memory/index.js';
import { ToolRegistry } from './registry/tool-registry.js';
import { SkillRegistry } from '../registry/skill-registry.js';
import { createEventBus } from './event-bus.js';
import { LLMClient } from '../runtime/llm-client.js';
import { config } from '../config.js';
import * as jobManager from '../job/manager.js';
import * as snapshotManager from '../job/snapshot-manager.js';

/**
 * Core 服务容器配置
 */
export interface CoreServicesConfig {
  memoryPolicy?: MemoryPolicy;
  dataDir?: string;
}

/**
 * 创建 Core 服务容器
 */
export function createCoreServices(_coreConfig?: CoreServicesConfig) {
  const memory = createMemoryManager();
  const toolRegistry = new ToolRegistry();
  const skillRegistry = new SkillRegistry();
  const llmClient = new LLMClient({
    apiKey: config.llm.apiKey,
    baseUrl: config.llm.baseUrl,
    model: config.llm.model,
  });
  const eventBus = createEventBus();

  // Job Manager 封装
  const jobManagerApi = {
    create: jobManager.createJob,
    get: jobManager.getJob,
    update: jobManager.updateJob,
    list: jobManager.listJobs,
    appendTrace: jobManager.appendTrace,
    createSnapshot: snapshotManager.createSnapshot,
    revertToSnapshot: snapshotManager.revertToSnapshot,
  };

  return {
    memory,
    toolRegistry,
    skillRegistry,
    jobManager: jobManagerApi,
    llmClient,
    eventBus,
  };
}

/**
 * 初始化 Core 服务
 */
export async function initializeCoreServices(services: ReturnType<typeof createCoreServices>): Promise<void> {
  const { skillRegistry, eventBus, jobManager } = services;

  // 注册内置 Skills
  const { csvSkill } = await import('../skills/csv-skill.js');
  const { bioinfoSkill } = await import('../skills/bioinfo-skill.js');
  
  skillRegistry.register(csvSkill);
  skillRegistry.register(bioinfoSkill);

  // 订阅快照触发事件（映射到 SnapshotTrigger 类型）
  const eventToTrigger: Record<string, string> = {
    'requirement.saved': 'requirement_saved',
    'analysis.before_execute': 'pre_execute',
    'analysis.after_execute': 'post_execute',
    'file.uploaded': 'dataset_changed',
  };

  for (const [event, trigger] of Object.entries(eventToTrigger)) {
    eventBus.subscribe(event as any, async (e: any) => {
      if (e.jobId) {
        try {
          await jobManager.createSnapshot(e.jobId, trigger as any);
          console.log(`[Core] Snapshot created for job ${e.jobId} on ${event}`);
        } catch (error) {
          console.error(`[Core] Failed to create snapshot:`, error);
        }
      }
    });
  }
}

// 导出类型和模块
export * from './types.js';
