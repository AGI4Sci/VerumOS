/**
 * Long Term Memory - 长期记忆
 *
 * 职责：
 * - 跨 job 向量检索
 * - 存储历史分析方案和用户偏好
 *
 * 实现方案：
 * - JSON 文件存储（data/.memory/）
 * - OpenAI 兼容 Embedding API
 * - 余弦相似度检索
 * - 降级：关键词匹配
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { LongTermMemoryPolicy } from '../types.js';

/**
 * 长期记忆条目
 */
export interface LongTermMemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    jobId?: string;
    sessionId?: string;
    type: 'analysis' | 'preference' | 'feedback' | 'insight';
    tags?: string[];
    createdAt: string;
  };
}

/**
 * 长期记忆检索结果
 */
export interface LongTermMemoryResult {
  entries: LongTermMemoryEntry[];
  context: string;
  scores?: number[];
}

/**
 * Embedding 客户端配置
 */
export interface EmbeddingConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * 记忆索引结构
 */
interface MemoryIndex {
  entries: Array<{
    id: string;
    metadata: LongTermMemoryEntry['metadata'];
    createdAt: string;
  }>;
  lastUpdated: string;
}

/**
 * LongTermMemory 实现
 */
export class LongTermMemory {
  private policy: LongTermMemoryPolicy;
  private dataDir: string;
  private memoryDir: string;
  private embeddingsDir: string;
  private indexPath: string;
  private configPath: string;
  private embeddingConfig?: EmbeddingConfig;
  private indexCache: MemoryIndex | null = null;
  private entriesCache: Map<string, LongTermMemoryEntry> = new Map();

  constructor(
    policy?: LongTermMemoryPolicy,
    dataDir?: string,
    embeddingConfig?: EmbeddingConfig
  ) {
    this.policy = {
      enabled: false,
      topK: 5,
      ...policy,
    };
    this.dataDir = dataDir || './data';
    this.memoryDir = path.join(this.dataDir, '.memory');
    this.embeddingsDir = path.join(this.memoryDir, 'embeddings');
    this.indexPath = path.join(this.memoryDir, 'index.json');
    this.configPath = path.join(this.memoryDir, 'config.json');
    this.embeddingConfig = embeddingConfig;
  }

  /**
   * 初始化存储目录
   */
  async initialize(): Promise<void> {
    if (!this.policy.enabled) {
      return;
    }

    try {
      await fs.mkdir(this.memoryDir, { recursive: true });
      await fs.mkdir(this.embeddingsDir, { recursive: true });

      // 初始化索引文件
      try {
        await fs.access(this.indexPath);
      } catch {
        await this.saveIndex({ entries: [], lastUpdated: new Date().toISOString() });
      }

      console.log('[LongTermMemory] Initialized at', this.memoryDir);
    } catch (error) {
      console.error('[LongTermMemory] Failed to initialize:', error);
    }
  }

  /**
   * 检索相关记忆
   *
   * @param query 查询文本
   * @param jobId 可选的 job 限制
   * @returns 检索结果或 null
   */
  async retrieve(query: string, jobId?: string): Promise<LongTermMemoryResult | null> {
    if (!this.policy.enabled) {
      return null;
    }

    try {
      const index = await this.loadIndex();
      if (index.entries.length === 0) {
        return null;
      }

      // 过滤指定 job 的记忆（如果提供了 jobId）
      let candidateEntries = index.entries;
      if (jobId) {
        candidateEntries = index.entries.filter(e => e.metadata.jobId === jobId);
      }

      if (candidateEntries.length === 0) {
        return null;
      }

      // 尝试使用 embedding 检索
      const queryEmbedding = await this.getEmbedding(query);
      if (queryEmbedding) {
        return await this.retrieveByEmbedding(queryEmbedding, candidateEntries);
      }

      // 降级：关键词匹配
      return this.retrieveByKeywords(query, candidateEntries);
    } catch (error) {
      console.error('[LongTermMemory] Retrieve failed:', error);
      return null;
    }
  }

  /**
   * 存储记忆
   *
   * @param content 记忆内容
   * @param metadata 元数据
   * @returns 记忆 ID 或 null
   */
  async store(
    content: string,
    metadata: Omit<LongTermMemoryEntry['metadata'], 'createdAt'>
  ): Promise<string | null> {
    if (!this.policy.enabled) {
      return null;
    }

    try {
      const id = this.generateId();
      const entry: LongTermMemoryEntry = {
        id,
        content,
        metadata: {
          ...metadata,
          createdAt: new Date().toISOString(),
        },
      };

      // 生成 embedding
      const embedding = await this.getEmbedding(content);
      if (embedding) {
        entry.embedding = embedding;
      }

      // 保存条目
      await this.saveEntry(entry);

      // 更新索引
      const index = await this.loadIndex();
      index.entries.push({
        id: entry.id,
        metadata: entry.metadata,
        createdAt: entry.metadata.createdAt,
      });
      index.lastUpdated = new Date().toISOString();
      await this.saveIndex(index);

      // 更新缓存
      this.entriesCache.set(id, entry);

      console.log(`[LongTermMemory] Stored memory ${id} (${metadata.type})`);
      return id;
    } catch (error) {
      console.error('[LongTermMemory] Store failed:', error);
      return null;
    }
  }

  /**
   * 使用 embedding 检索
   */
  private async retrieveByEmbedding(
    queryEmbedding: number[],
    candidates: MemoryIndex['entries']
  ): Promise<LongTermMemoryResult | null> {
    const topK = this.policy.topK || 5;
    const scored: Array<{ entry: LongTermMemoryEntry; score: number }> = [];

    for (const candidate of candidates) {
      const entry = await this.loadEntry(candidate.id);
      if (!entry || !entry.embedding) {
        continue;
      }

      const score = this.cosineSimilarity(queryEmbedding, entry.embedding);
      scored.push({ entry, score });
    }

    // 按相似度排序
    scored.sort((a, b) => b.score - a.score);

    // 取 topK
    const topEntries = scored.slice(0, topK);

    if (topEntries.length === 0) {
      return null;
    }

    return {
      entries: topEntries.map(s => s.entry),
      context: this.formatContext(topEntries.map(s => s.entry)),
      scores: topEntries.map(s => s.score),
    };
  }

  /**
   * 使用关键词检索（降级方案）
   */
  private retrieveByKeywords(
    query: string,
    candidates: MemoryIndex['entries']
  ): LongTermMemoryResult | null {
    const topK = this.policy.topK || 5;
    const queryWords = this.tokenize(query.toLowerCase());
    const scored: Array<{ entry: LongTermMemoryEntry; score: number }> = [];

    for (const candidate of candidates) {
      const entry = this.entriesCache.get(candidate.id);
      if (!entry) {
        continue;
      }

      const entryWords = this.tokenize(entry.content.toLowerCase());
      const score = this.jaccardSimilarity(queryWords, entryWords);
      scored.push({ entry, score });
    }

    // 按相似度排序
    scored.sort((a, b) => b.score - a.score);

    // 取 topK
    const topEntries = scored.slice(0, topK);

    if (topEntries.length === 0) {
      return null;
    }

    return {
      entries: topEntries.map(s => s.entry),
      context: this.formatContext(topEntries.map(s => s.entry)),
      scores: topEntries.map(s => s.score),
    };
  }

  /**
   * 获取文本的 embedding
   */
  private async getEmbedding(text: string): Promise<number[] | null> {
    if (!this.embeddingConfig) {
      return null;
    }

    try {
      const response = await fetch(`${this.embeddingConfig.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.embeddingConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: text,
          model: this.embeddingConfig.model,
        }),
      });

      if (!response.ok) {
        console.warn(`[LongTermMemory] Embedding API returned ${response.status}`);
        return null;
      }

      const data = await response.json() as { data?: Array<{ embedding?: number[] }> };
      const embedding = data.data?.[0]?.embedding;

      if (!embedding) {
        console.warn('[LongTermMemory] No embedding in response');
        return null;
      }

      return embedding;
    } catch (error) {
      console.warn('[LongTermMemory] Failed to get embedding:', error);
      return null;
    }
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Jaccard 相似度（关键词匹配降级用）
   */
  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) {
      return 0;
    }

    const intersection = new Set([...a].filter(x => b.has(x)));
    const union = new Set([...a, ...b]);

    return intersection.size / union.size;
  }

  /**
   * 文本分词
   */
  private tokenize(text: string): Set<string> {
    // 简单分词：按空格和标点分割
    const words = text.split(/[\s\p{P}]+/u).filter(w => w.length > 1);
    return new Set(words);
  }

  /**
   * 格式化检索结果为上下文文本
   */
  private formatContext(entries: LongTermMemoryEntry[]): string {
    const lines: string[] = ['### 相关历史记忆', ''];

    for (const entry of entries) {
      const typeIcon = {
        analysis: '🔬',
        preference: '👤',
        feedback: '💬',
        insight: '💡',
      }[entry.metadata.type] || '📝';

      const time = new Date(entry.metadata.createdAt).toLocaleDateString('zh-CN');
      lines.push(`${typeIcon} **[${entry.metadata.type}]** (${time})`);
      lines.push(entry.content);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 加载索引
   */
  private async loadIndex(): Promise<MemoryIndex> {
    if (this.indexCache) {
      return this.indexCache;
    }

    try {
      const content = await fs.readFile(this.indexPath, 'utf-8');
      this.indexCache = JSON.parse(content) as MemoryIndex;
      return this.indexCache!;
    } catch {
      return { entries: [], lastUpdated: new Date().toISOString() };
    }
  }

  /**
   * 保存索引
   */
  private async saveIndex(index: MemoryIndex): Promise<void> {
    await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
    this.indexCache = index;
  }

  /**
   * 加载条目
   */
  private async loadEntry(id: string): Promise<LongTermMemoryEntry | null> {
    if (this.entriesCache.has(id)) {
      return this.entriesCache.get(id)!;
    }

    try {
      const entryPath = path.join(this.embeddingsDir, `${id}.json`);
      const content = await fs.readFile(entryPath, 'utf-8');
      const entry = JSON.parse(content) as LongTermMemoryEntry;
      this.entriesCache.set(id, entry);
      return entry;
    } catch {
      return null;
    }
  }

  /**
   * 保存条目
   */
  private async saveEntry(entry: LongTermMemoryEntry): Promise<void> {
    const entryPath = path.join(this.embeddingsDir, `${entry.id}.json`);
    await fs.writeFile(entryPath, JSON.stringify(entry, null, 2), 'utf-8');
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * 更新策略
   */
  setPolicy(policy: Partial<LongTermMemoryPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }

  /**
   * 检查是否启用
   */
  isEnabled(): boolean {
    return this.policy.enabled ?? false;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.indexCache = null;
    this.entriesCache.clear();
  }

  /**
   * 删除记忆
   */
  async delete(id: string): Promise<boolean> {
    try {
      // 从索引中删除
      const index = await this.loadIndex();
      const entryIndex = index.entries.findIndex(e => e.id === id);
      if (entryIndex === -1) {
        return false;
      }

      index.entries.splice(entryIndex, 1);
      index.lastUpdated = new Date().toISOString();
      await this.saveIndex(index);

      // 删除文件
      const entryPath = path.join(this.embeddingsDir, `${id}.json`);
      await fs.unlink(entryPath).catch(() => {});

      // 清除缓存
      this.entriesCache.delete(id);

      return true;
    } catch (error) {
      console.error(`[LongTermMemory] Failed to delete ${id}:`, error);
      return false;
    }
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{ total: number; byType: Record<string, number> }> {
    const index = await this.loadIndex();
    const byType: Record<string, number> = {};

    for (const entry of index.entries) {
      const type = entry.metadata.type;
      byType[type] = (byType[type] || 0) + 1;
    }

    return {
      total: index.entries.length,
      byType,
    };
  }
}

/**
 * 创建默认的 LongTermMemory
 */
export function createLongTermMemory(
  policy?: LongTermMemoryPolicy,
  dataDir?: string,
  embeddingConfig?: EmbeddingConfig
): LongTermMemory {
  return new LongTermMemory(policy, dataDir, embeddingConfig);
}
