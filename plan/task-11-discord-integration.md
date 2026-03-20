# Task 11 · Discord 聊天群集成

## 目标

让科学家可以在 Discord 服务器中使用 `/bioagent` Slash Command 或 @mention 触发分析，结果以 Discord Embed（富文本卡片）格式返回。

---

## 集成方案选择

与飞书类似，提供两种路径：

| 方案 | 说明 | 选择 |
|------|------|------|
| **openclaw Discord 扩展**（推荐） | 通过 `@openclaw/discord` 扩展接入，BioAgent 注册为 openclaw skill | 推荐 |
| 独立 Discord Bot | BioAgent 自己实现 Discord Bot，处理 slash command 和 interaction | 备选 |

---

## 方案 A：作为 openclaw Skill（推荐）

openclaw 的 Discord 扩展已处理：Bot token、权限、slash command 注册、interaction 响应。
BioAgent 的 `bio_research` 工具（在 Task 10 中注册到 openclaw）**天然可在 Discord 渠道中使用**，无需额外开发。

### 使用方式

科学家在 Discord 服务器中：
```
@BioAgent EGFR 突变在非小细胞肺癌 osimertinib 耐药机制中的作用？
```

openclaw Pi Agent 收到 @mention 后调用 `bio_research` 工具，结果通过 `formatResultForDiscord()` 格式化后发回 Discord。

### Discord 格式适配

openclaw 的 Discord 扩展文档说明：
> "Avoid Markdown tables in outbound Discord messages. Prefer Discord components v2 for rich UI."

因此需要针对 Discord 调整 `formatResultForChat()` 的输出：

```ts
// 在 src/tool.ts 的 run() 中，根据 channel 选择格式化函数
async run(input, context) {
  const result = await callBioAgent(input);
  const channel = context?.channel ?? "unknown";
  return channel === "discord"
    ? formatResultForDiscord(result)
    : formatResultForFeishu(result);
}

function formatResultForDiscord(scenario: Scenario): string {
  const rec = scenario.decision_output.current_recommendation;
  // Discord 支持 Markdown，但不支持飞书卡片语法
  // 使用 Discord components v2 风格的 Markdown
  return [
    `# ${scenario.name}`,
    `> ${rec.headline}`,
    ``,
    `**可信度:** \`${rec.confidence}\` | **状态:** ${scenario.status_label}`,
    ``,
    rec.summary,
    ``,
    `**下一步:** ${rec.next_action}`,
    ``,
    `## 支持证据`,
    ...scenario.decision_output.supporting_evidence.slice(0, 2).map(
      (e) => `### ${e.title}\n${e.meta ? `_${e.meta}_\n` : ""}${e.text}`
    ),
    ``,
    `## 已知无效路径`,
    ...scenario.decision_output.negative_paths.slice(0, 2).map(
      (e) => `- **${e.title}**: ${e.text}`
    ),
    ``,
    `-# 数据来源: ${scenario.data_agent.object.source}`,
  ].join("\n");
}
```

---

## 方案 B：独立 Discord Bot（降级备选）

如果不使用 openclaw，独立实现 Discord Interactions Endpoint（无需 Discord.js gateway 长连接）。

openclaw 的 Discord 扩展使用 `@buape/carbon`，我们可以直接使用 `discord-api-types` + 自己的 HTTP endpoint。

### 架构

```
Discord 服务器
  → POST /webhook/discord（BioAgent 新增）
  → 验证 Ed25519 签名（DISCORD_PUBLIC_KEY）
  → 处理 /bioagent slash command 或 APPLICATION_COMMAND interaction
  → 立即返回 "思考中..." (DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE)
  → 异步执行分析
  → 通过 followup webhook 更新消息
```

### 关键实现

```ts
// src/webhooks/discord.ts
import { verifyKey } from "discord-interactions";  // 或手动实现 ed25519 验证

app.post("/webhook/discord", async (c) => {
  const signature = c.req.header("X-Signature-Ed25519")!;
  const timestamp  = c.req.header("X-Signature-Timestamp")!;
  const rawBody    = await c.req.text();

  const isValid = verifyKey(rawBody, signature, timestamp, process.env.DISCORD_PUBLIC_KEY!);
  if (!isValid) return c.json({ error: "invalid signature" }, 401);

  const body = JSON.parse(rawBody);

  // PING（Discord 验证 endpoint 时发送）
  if (body.type === 1) return c.json({ type: 1 });

  // Slash Command: /bioagent <question>
  if (body.type === 2 && body.data.name === "bioagent") {
    const query = body.data.options?.[0]?.value ?? "";
    const interactionToken = body.token;
    const appId = body.application_id;

    // 立即 ACK（5 秒内必须响应）
    setImmediate(() => processDiscordAnalysis(query, appId, interactionToken));
    return c.json({ type: 5 });  // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  }

  return c.json({ type: 1 });
});

async function processDiscordAnalysis(
  query: string,
  appId: string,
  interactionToken: string
): Promise<void> {
  try {
    const scenario = await runAnalysis({
      scenario_id: detectScenarioId(query),
      query,
      mode:     "precision",
      priority: "target-prioritization",
    });
    const content = formatResultForDiscord(scenario);

    // Followup 更新（超出 2000 字符时使用 embeds）
    await fetch(
      `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}/messages/@original`,
      {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ content: content.slice(0, 2000) }),
      }
    );
  } catch (err) {
    // 分析失败时更新为错误消息
    await fetch(
      `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}/messages/@original`,
      {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ content: `分析失败：${String(err)}` }),
      }
    );
  }
}
```

### Slash Command 注册

首次部署时需要向 Discord 注册 `/bioagent` slash command：

```ts
// scripts/register-discord-command.ts
const command = {
  name:        "bioagent",
  description: "触发生物医学研究分析",
  options: [{
    type: 3,  // STRING
    name: "question",
    description: "你的科研问题，例如：BRCA1 在 TNBC 中的治疗优先级？",
    required: true,
  }],
};

await fetch(`https://discord.com/api/v10/applications/${APP_ID}/commands`, {
  method:  "POST",
  headers: {
    "Authorization":  `Bot ${BOT_TOKEN}`,
    "Content-Type":   "application/json",
  },
  body: JSON.stringify(command),
});
```

---

## 配置项（`.env`）

```env
# 方案 A（openclaw skill，已在 openclaw 配置 Discord）
# 无需额外配置，BIOAGENT_URL 已在 Task 10 中设置

# 方案 B（独立 Discord Bot）
DISCORD_PUBLIC_KEY=xxxx       # 用于验证 interaction 签名
DISCORD_BOT_TOKEN=xxxx        # 用于发送消息（followup）
DISCORD_APPLICATION_ID=xxxx  # Application ID
```

---

## 两种渠道共用的场景识别逻辑

无论飞书还是 Discord，都需要从用户消息中自动选择最合适的分析场景：

```ts
// src/utils/detect-scenario.ts
const SCENARIO_KEYWORDS: Record<string, string[]> = {
  "target-brca1":       ["brca1", "brca2", "parp", "三阴性", "tnbc", "乳腺癌"],
  "pathway-pi3k":       ["pi3k", "akt", "mtor", "pten", "pik3ca", "cdk4", "cdk6"],
  "scrna-tumor-micro":  ["scrna", "单细胞", "肿瘤微环境", "t细胞", "til", "tpex", "exhaustion"],
};

export function detectScenarioId(query: string): string {
  const lower = query.toLowerCase();
  for (const [id, keywords] of Object.entries(SCENARIO_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return id;
  }
  return "target-brca1";  // 默认场景
}
```

---

## 验收标准

- 方案 A：Discord 中 @BioAgent 后收到格式化分析结果
- 方案 B：`/bioagent` slash command 在 1 秒内收到"处理中"响应，30 秒内更新为完整结果
- Discord 消息格式：无 Markdown 表格，使用代码块/引用块表示结构
- Ed25519 签名验证通过（Discord 安全要求）
