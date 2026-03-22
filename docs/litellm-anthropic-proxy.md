# LiteLLM：本机 Anthropic → 远端 OpenAI（vLLM）

Claude Code / OpenClaw 走 **Anthropic**；远端 GLM-5 多为 **OpenAI 兼容**。在本机起 **LiteLLM Proxy**（`4000`），经 **SSH** 把本机 `8001` 转到远端 vLLM（`8000`）。远端不用装 LiteLLM。

**顺序**：SSH 隧道 → 启动 LiteLLM → 客户端 `baseUrl` 指 `http://127.0.0.1:4000`（不要指 `8001`）。

---

## 命令

**1. 隧道（本机执行，会话保持）**

```bash
ssh -N -L 8001:127.0.0.1:8000 -CAXY ws-59e2651af822370e-worker-4dcvv.wuhao+root.ailab-beam.pod@h.pjlab.org.cn
```

本机 `http://127.0.0.1:8001/v1` 即远端 vLLM 的 OpenAI 根路径。

**2. 安装**

```bash
pip install 'litellm[proxy]'
```

**3. 配置**（仓库 `docs/litellm_config.yaml`，按需改 `model_name` / `api_base` / 隧道端口）

```yaml
litellm_settings:
  drop_params: true   # OpenClaw 会带 reasoning_effort，不丢则 vLLM 可能 400

model_list:
  - model_name: glm-5-fp8
    litellm_params:
      model: openai/glm-5-fp8
      api_base: http://127.0.0.1:8001/v1
      api_key: "dummy"
```

**4. 启动（在仓库根目录）**

```bash
litellm --config ./docs/litellm_config.yaml --host 127.0.0.1 --port 4000
```

**5. Claude Code / shell**

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:4000
export ANTHROPIC_AUTH_TOKEN=EMPTY
export ANTHROPIC_DEFAULT_SONNET_MODEL=glm-5-fp8
```

**6. OpenClaw**（`~/.openclaw/openclaw.json` 或 `~/.config/openclaw/openclaw.json5` 里合并）

```json5
models: {
  mode: "merge",
  providers: {
    anthropic: { baseUrl: "http://127.0.0.1:4000", apiKey: "EMPTY" },
  },
},
```

```bash
openclaw doctor && openclaw gateway restart
```

---

## 说明（最短）

| 项 | 说明 |
|----|------|
| `8001` | SSH 本地端口，与 `api_base` 一致即可。 |
| `4000` | LiteLLM 监听端口；所有 Anthropic 客户端指向这里。 |
| `drop_params` | 避免 OpenClaw → vLLM 因不支持的参数报错。 |
| OpenClaw 仍指向 `18000` | 隧道改掉后 `18000` 无服务，应改 `baseUrl` 到 LiteLLM。 |
| 流式报错 `message_start` / `message_stop` | 升级 LiteLLM；多为代理 SSE 顺序与 OpenClaw 校验不一致。 |
| 双协议 | 同一 LiteLLM 进程：`/v1/messages`（Anthropic）与 `/v1/chat/completions`（OpenAI）同源。 |

文档：[LiteLLM Anthropic](https://docs.litellm.ai/docs/anthropic_unified) · [vLLM 提供方](https://docs.litellm.ai/docs/providers/vllm) · [GLM-5 部署](https://huggingface.co/zai-org/GLM-5)
