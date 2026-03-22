import type { ScenarioMeta, ScenarioStatus } from "./schemas.js";

// ScenarioConfig - Extended scenario with context for LLM
export interface ScenarioConfig {
  meta: ScenarioMeta;
  default_query: string;
  context: string;
  overview: string;
  positioning_quote: string;
  hero_cards: Array<{ title: string; text: string }>;
}

// Built-in scenarios
export const SCENARIOS: ScenarioConfig[] = [
  {
    meta: {
      id: "target-brca1",
      name: "BRCA1 靶点优先级评估",
      status: "live" as ScenarioStatus,
      status_label: "Active",
      one_liner: "评估 BRCA1 通路在三阴性乳腺癌中的干预优先级与证据质量",
      tags: ["BRCA1", "乳腺癌", "DNA修复", "PARP抑制剂"],
    },
    default_query: "BRCA1 在三阴性乳腺癌中的靶向治疗优先级如何？现有证据链的可信度？",
    context: `三阴性乳腺癌（TNBC）缺乏 ER/PR/HER2 靶点，BRCA1 突变频率约 15-20%，PARP 抑制剂已进入临床。
关键问题：BRCA1 突变携带者对 PARP 抑制剂的响应率、耐药机制、联合治疗策略。
相关数据库：TCGA-BRCA、GEO、ClinicalTrials.gov、PubMed。`,
    overview: "评估 BRCA1 通路在三阴性乳腺癌中的干预优先级与证据质量",
    positioning_quote: "BRCA1 突变是 TNBC 最重要的可干预靶点之一",
    hero_cards: [
      { title: "PARP 抑制剂敏感性", text: "BRCA1 突变携带者对奥拉帕尼响应率达 60%" },
      { title: "耐药机制", text: "BRCA1 回复突变是主要耐药原因" },
    ],
  },
  {
    meta: {
      id: "pathway-pi3k",
      name: "PI3K/AKT 通路信号分析",
      status: "watch" as ScenarioStatus,
      status_label: "Under Review",
      one_liner: "分析 PI3K/AKT/mTOR 轴在耐药机制中的作用，识别可干预节点",
      tags: ["PI3K", "AKT", "mTOR", "耐药"],
    },
    default_query: "PI3K/AKT 通路在 CDK4/6 抑制剂耐药中的作用机制与干预窗口？",
    context: `PI3K/AKT/mTOR 轴是乳腺癌最常见激活通路之一，在 CDK4/6 抑制剂耐药后常出现 PIK3CA 突变。
关键问题：PI3K 抑制剂联合治疗时机、生物标志物选择、毒性管理。
相关数据库：TCGA、cBioPortal、PubMed、ClinicalTrials.gov。`,
    overview: "分析 PI3K/AKT/mTOR 轴在耐药机制中的作用，识别可干预节点",
    positioning_quote: "PI3K 通路激活是内分泌治疗耐药的重要机制",
    hero_cards: [
      { title: "PIK3CA 突变频率", text: "HR+ 乳腺癌中约 40% 携带 PIK3CA 突变" },
      { title: "联合治疗", text: "PI3K 抑制剂 + 内分泌治疗显示 PFS 获益" },
    ],
  },
  {
    meta: {
      id: "scrna-tumor-micro",
      name: "单细胞 RNA 肿瘤微环境解析",
      status: "watch" as ScenarioStatus,
      status_label: "In Progress",
      one_liner: "基于 scRNA-seq 数据解析肿瘤微环境细胞组成，聚焦 T 细胞亚群功能状态",
      tags: ["scRNA-seq", "肿瘤微环境", "T细胞", "exhaustion"],
    },
    default_query: "如何从 scRNA-seq 数据中准确识别 Tpex 细胞亚群？与耗竭型 T 细胞的分子边界？",
    context: `肿瘤浸润淋巴细胞（TIL）的功能状态直接影响免疫治疗响应，Tpex（precursor exhausted T cells）是维持抗肿瘤免疫的关键亚群。
关键问题：Tpex 的分子标志物、与 Tex 的区分标准、在免疫治疗中的动态变化。
相关数据库：GEO、ArrayExpress、PubMed、ImmPort。`,
    overview: "基于 scRNA-seq 数据解析肿瘤微环境细胞组成，聚焦 T 细胞亚群功能状态",
    positioning_quote: "Tpex 是免疫治疗响应的关键预测因子",
    hero_cards: [
      { title: "Tpex 标志物", text: "TCF1+ TOX+ PD-1+ 定义 Tpex 亚群" },
      { title: "临床意义", text: "Tpex 比例与 ICI 响应正相关" },
    ],
  },
];

// Get scenario by ID
export function getScenario(id: string): ScenarioConfig | undefined {
  return SCENARIOS.find((s) => s.meta.id === id);
}

// Default scenario ID
export const DEFAULT_SCENARIO_ID = SCENARIOS[0].meta.id;

// Get default query for a scenario
export function getDefaultQuery(scenarioId: string): string {
  const scenario = getScenario(scenarioId);
  return scenario?.default_query ?? SCENARIOS[0].default_query;
}