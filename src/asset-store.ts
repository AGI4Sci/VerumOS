import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type {
  ExpertCorrection,
  KnowledgeNode,
  NegativeResult,
  ScenarioAssetStore,
  AssetMetrics,
} from "./schemas.js";

const DATA_DIR = process.env.DATA_DIR ?? "./data";
const STORE_PATH = resolve(DATA_DIR, "asset-store.json");

// Memory storage structure
interface StoreShape {
  [scenarioId: string]: ScenarioAssetStore;
}

let store: StoreShape = {};

// Seed data for initial demo
const SEED_DATA: StoreShape = {
  "target-brca1": {
    expert_corrections: [
      {
        expert: "王磊 教授",
        from: "Cluster 7 = Tem",
        to: "Cluster 7 = Tpex",
        reason: "基于 TOX/TCF1 共表达判断为前驱耗竭亚群，非效应记忆",
        timestamp: "2024-11-01T09:00:00Z",
      },
    ],
    knowledge_nodes: [
      {
        title: "BRCA1 突变与 PARP 抑制剂敏感性",
        freshness: "2024",
        status: "confirmed",
      },
      {
        title: "TNBC 中 BRCA1 胚系突变率",
        freshness: "2023",
        status: "confirmed",
      },
    ],
    negative_results: [
      {
        title: "单用奥拉帕尼 vs. 铂类联合用药",
        effect: "联合组 PFS 未显示统计显著优势（OLYMPIA 亚组分析）",
      },
    ],
  },
  "pathway-pi3k": {
    expert_corrections: [],
    knowledge_nodes: [
      {
        title: "PIK3CA 突变与 PI3K 抑制剂响应",
        freshness: "2024",
        status: "confirmed",
      },
    ],
    negative_results: [],
  },
  "scrna-tumor-micro": {
    expert_corrections: [],
    knowledge_nodes: [
      {
        title: "Tpex 分子标志物定义",
        freshness: "2024",
        status: "confirmed",
      },
    ],
    negative_results: [],
  },
};

// ── Initialization ───────────────────────────────────────────────────────────

export function loadStore(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(STORE_PATH)) {
    try {
      const loaded = JSON.parse(readFileSync(STORE_PATH, "utf-8")) as StoreShape;
      store = loaded;
      // Merge with seed data for any missing scenarios
      for (const [id, assets] of Object.entries(SEED_DATA)) {
        if (!store[id]) {
          store[id] = assets;
        }
      }
    } catch {
      store = { ...SEED_DATA };
    }
  } else {
    store = { ...SEED_DATA };
  }
  saveStore();
}

function saveStore(): void {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

// ── Scenario-level assets ────────────────────────────────────────────────────

function ensureScenario(scenarioId: string): void {
  if (!store[scenarioId]) {
    store[scenarioId] = {
      expert_corrections: [],
      knowledge_nodes: [],
      negative_results: [],
    };
  }
}

export function getScenarioAssets(scenarioId: string): ScenarioAssetStore {
  ensureScenario(scenarioId);
  return store[scenarioId];
}

// ── Write operations ──────────────────────────────────────────────────────────

export function addExpertCorrection(
  scenarioId: string,
  correction: Omit<ExpertCorrection, "timestamp">
): ExpertCorrection {
  ensureScenario(scenarioId);
  const item: ExpertCorrection = {
    ...correction,
    timestamp: new Date().toISOString(),
  };
  store[scenarioId].expert_corrections.push(item);
  saveStore();
  return item;
}

export function upsertKnowledgeNodes(
  scenarioId: string,
  nodes: KnowledgeNode[]
): void {
  ensureScenario(scenarioId);
  const existing = new Map(
    store[scenarioId].knowledge_nodes.map((n) => [n.title, n])
  );
  for (const node of nodes) {
    existing.set(node.title, node);
  }
  store[scenarioId].knowledge_nodes = [...existing.values()];
  saveStore();
}

export function upsertNegativeResults(
  scenarioId: string,
  results: NegativeResult[]
): void {
  ensureScenario(scenarioId);
  const existing = new Map(
    store[scenarioId].negative_results.map((r) => [r.title, r])
  );
  for (const result of results) {
    existing.set(result.title, result);
  }
  store[scenarioId].negative_results = [...existing.values()];
  saveStore();
}

// ── Global aggregation metrics ───────────────────────────────────────────────

export function getAssetMetrics(): AssetMetrics {
  let corrections = 0;
  let knowledgeNodes = 0;
  let negativeResults = 0;
  for (const assets of Object.values(store)) {
    corrections += assets.expert_corrections.length;
    knowledgeNodes += assets.knowledge_nodes.length;
    negativeResults += assets.negative_results.length;
  }
  return {
    expert_corrections: corrections,
    knowledge_nodes: knowledgeNodes,
    negative_results: negativeResults,
  };
}