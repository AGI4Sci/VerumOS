# Task 10 · 飞书（Feishu）聊天群集成

## 目标

让科学家可以在飞书群里直接 @BioAgent 提问，机器人自动触发分析流水线，用飞书互动卡片（Card）格式返回可信分析结果。

---

## 集成方案选择

| 方案 | 说明 | 选择 |
|------|------|------|
| **openclaw 飞书扩展**（推荐） | 通过 openclaw 的 `@openclaw/feishu` 扩展路由消息，BioAgent 注册为 openclaw skill | 推荐：复用已有渠道基础设施，零重复实现 |
| 独立飞书自定义机器人 | BioAgent 自己接 Feishu Webhook + 事件订阅，独立运行 | 备选：依赖更少，但要自己处理签名验证、消息格式等 |

本方案**优先实现 openclaw 扩展方式**，以独立 webhook 方式作为降级备选。

---

## 方案 A：作为 openclaw Skill（推荐）

### 原理

openclaw 已经处理了飞书的认证、@mention 解析、消息接收和回复。
BioAgent 只需注册为一个 **skill**，openclaw 的 Pi Agent 会在收到研究问题时调用它。

### 1. 创建 openclaw 扩展

目录：`extensions/bio-research-agent/`（放在 openclaw 仓库的 extensions 目录）

```
extensions/bio-research-agent/
├── src/
│   ├── tool.ts          # 注册 bio_research 工具
│   └── client.ts        # 调用 BioAgent HTTP API
├── index.ts             # definePluginEntry
├── package.json
└── openclaw.plugin.json
```

### 2. `package.json`

```json
{
  "name": "@openclaw/bio-research-agent",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "zod": "^4.3.0"
  },
  "peerDependencies": {
    "openclaw": "*"
  },
  "openclaw": {
    "extensions": ["./index.ts"]
  }
}
```

### 3. `src/tool.ts` — 注册 bio_research 工具

```ts
import { definePluginEntry } from "openclaw/plugin-sdk/core";
import { callBioAgent } from "./client.js";

export default definePluginEntry({
  id: "bio-research-agent",
  name: "BioAgent Research Tool",
  description: "生物医学 Research Agent，检索 PubMed 等数据库，提供可信科研判断",
  register(api) {
    api.registerTool({
      name: "bio_research",
      description: `\
生物医学研究分析工具。当用户提出生物医学科研问题时（靶点、通路、文献证据、实验方向等），
调用此工具获取基于真实文献数据库的可信分析报告。
输入：研究问题字符串。输出：分析报告（包含证据链、阴性结果、专家建议）。`,
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "科研问题，例如：BRCA1 在三阴性乳腺癌中的治疗优先级？",
          },
          scenario_id: {
            type: "string",
            description: "分析场景 ID（可选，默认 target-brca1）",
          },
          mode: {
            type: "string",
            enum: ["precision", "breadth"],
            description: "分析深度：precision=精确聚焦，breadth=广泛综述",
          },
        },
        required: ["query"],
      },
      async run(input) {
        const result = await callBioAgent({
          query:       input.query,
          scenario_id: input.scenario_id ?? "target-brca1",
          mode:        (input.mode as "precision" | "breadth") ?? "precision",
          priority:    "target-prioritization",
        });
        return formatResultForChat(result);
      },
    });
  },
});
```

### 4. `src/client.ts` — 调用 BioAgent HTTP API

```ts
const BIOAGENT_BASE_URL = process.env.BIOAGENT_URL ?? "http://localhost:3000";

export async function callBioAgent(params: {...}): Promise<Scenario> {
  const res = await fetch(`${BIOAGENT_BASE_URL}/api/run-analysis`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`BioAgent API error: ${res.status}`);
  const data = await res.json();
  return data.scenario as Scenario;
}
```

### 5. `formatResultForChat()` — 飞书卡片格式

科学家在飞书群看到的不是 JSON，而是结构化的飞书互动卡片：

```ts
function formatResultForChat(scenario: Scenario): string {
  const rec = scenario.decision_output.current_recommendation;
  const supporting = scenario.decision_output.supporting_evidence.slice(0, 2);
  const opposing   = scenario.decision_output.opposing_evidence.slice(0, 1);
  const negative   = scenario.decision_output.negative_paths.slice(0, 1);

  return [
    `## ${scenario.name}`,
    `**可信度：** ${rec.confidence} | **状态：** ${scenario.status_label}`,
    ``,
    `### 核心建议`,
    `**${rec.headline}**`,
    rec.summary,
    ``,
    `**下一步：** ${rec.next_action}`,
    ``,
    `### 支持证据`,
    ...supporting.map((e) => `- **${e.title}**（${e.meta ?? ""}）：${e.text}`),
    ``,
    `### 反对证据`,
    ...opposing.map((e) => `- **${e.title}**：${e.text}`),
    ``,
    `### 已知无效路径`,
    ...negative.map((e) => `- **${e.title}**：${e.text}`),
    ``,
    `---`,
    `_Data Agent: ${scenario.data_agent.object.source} | Model: ${scenario.model_agent.object.protocol_version}_`,
    `_可访问 ${process.env.BIOAGENT_URL ?? "http://localhost:3000"} 查看完整分析报告_`,
  ].join("\n");
}
```

### 6. 科学家使用方式

在飞书群中发送：
```
@BioAgent BRCA1 在三阴性乳腺癌中的 PARP 抑制剂响应预测因子有哪些？
```

openclaw 接收到 @mention，Pi Agent 调用 `bio_research` 工具，BioAgent 返回分析，openclaw 将格式化结果发回飞书群。

---

## 方案 B：独立飞书 Webhook Bot（降级备选）

如果不使用 openclaw，可以直接接飞书的事件订阅：

### 架构

```
飞书服务器
  → POST /webhook/feishu（BioAgent 服务器新增）
  → 验证 X-Lark-Request-Timestamp 和 X-Lark-Signature
  → 解析 @mention 消息
  → 调用分析流水线
  → 调用飞书 sendCard API 返回结果
```

### 依赖

使用 openclaw 飞书扩展已在用的 SDK（避免重复引入）：
```json
"@larksuiteoapi/node-sdk": "^1.59.0"
```

### 实现要点

```ts
// src/webhooks/feishu.ts
import * as lark from "@larksuiteoapi/node-sdk";

const client = new lark.Client({
  appId:     process.env.FEISHU_APP_ID!,
  appSecret: process.env.FEISHU_APP_SECRET!,
});

// 处理 @mention 事件
app.post("/webhook/feishu", async (c) => {
  const body = await c.req.json();

  // 验证签名
  if (!verifyFeishuSignature(c.req.header("X-Lark-Signature"), body)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  // URL 验证挑战（首次配置）
  if (body.type === "url_verification") {
    return c.json({ challenge: body.challenge });
  }

  // 消息事件
  const event = body.event;
  if (event?.type !== "im.message.receive_v1") return c.json({ ok: true });

  const text = extractPlainText(event.message);
  const query = stripBotMention(text);
  if (!query.trim()) return c.json({ ok: true });

  // 异步处理（飞书要求 3 秒内响应）
  setImmediate(async () => {
    const scenario = await runAnalysis({
      scenario_id: detectScenarioId(query),
      query,
      mode:     "precision",
      priority: "target-prioritization",
    });
    await sendFeishuCard(client, event.message.chat_id, scenario);
  });

  return c.json({ ok: true });
});
```

---

## 配置项（`.env`）

```env
# 方案 A（openclaw skill）
BIOAGENT_URL=http://localhost:3000

# 方案 B（独立 webhook）
FEISHU_APP_ID=cli_xxxx
FEISHU_APP_SECRET=xxxx
FEISHU_VERIFY_TOKEN=xxxx
FEISHU_ENCRYPT_KEY=xxxx   # 可选
```

---

## 验收标准

- 方案 A：在飞书群 @BioAgent 后 30 秒内收到格式化分析结果
- 方案 B：`POST /webhook/feishu` 在 3 秒内返回 200（异步处理）
- 结果消息包含核心建议、支持/反对证据、已知无效路径
- 专家可以在飞书群回复修正意见（下一步扩展：解析飞书回复触发 `/api/expert-correction`）
