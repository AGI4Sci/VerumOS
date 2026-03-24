# Debug Report - SCP 工具修复

## 调试人员
- debug-01

## 调试时间
- 2026-03-24

## 问题描述
SCP Hub 工具无法正常调用

## 问题诊断

### 1. API 调用方式错误
**发现：** 原代码使用 REST API 格式调用 SCP Hub
- 错误格式：`/api/v1/tools/invoke`
- 正确格式：MCP 协议 `/api/v1/mcp/<server_id>/<server_name>`

**根因：** SCP Hub 使用 MCP (Model Context Protocol) 协议，不是普通 REST API

### 2. API Base URL 错误
**发现：** `.env` 中配置的 URL 错误
- 错误：`https://scphub.intern-ai.org.cn`
- 正确：`https://scp.intern-ai.org.cn`

**影响：** 导致 404 错误

## 修复内容

### 1. 重写 SCP 路由 (`src/routes/scp.ts`)
- 实现 MCP 协议调用
- 支持 initialize, tools/list, tools/call 方法
- 添加调试端点 `/api/scp/debug`

### 2. 更新配置 (`.env`)
- 修正 SCP_BASE_URL 为 `https://scp.intern-ai.org.cn`
- 更新 SCP_API_KEY 为新密钥

### 3. 更新工具调用器 (`src/tools/scp-tool-invoker.ts`)
- 实现 MCP 客户端
- 支持 37 个 SCP 服务

## 测试结果

### API 测试
```bash
# 测试连接
curl http://localhost:3000/api/scp/test
# 结果: ✅ 成功，发现 92 个工具

# 测试工具调用
curl -X POST http://localhost:3000/api/scp/invoke \
  -H "Content-Type: application/json" \
  -d '{"server_name":"Origene-UniProt","tool_name":"get_general_info_by_protein_or_gene_name","arguments":{"query":"TP53"}}'
# 结果: ✅ 成功返回 TP53 蛋白质信息
```

### 网页端测试
- ✅ 服务启动正常
- ✅ Analysis Agent 工具池显示正常
- ✅ 聊天功能正常工作

## 可用 SCP 服务

| 服务名称 | 工具数 | 状态 |
|---------|--------|------|
| Origene-OpenTargets | 92 | ✅ |
| Origene-UniProt | 121 | ✅ |
| Origene-ChEMBL | 47 | ✅ |
| Origene-TCGA | 8 | ✅ |
| Origene-KEGG | 10 | ✅ |

## 遗留问题

### 1. 前端工具池显示
**问题：** 前端 `web/index.html` 中 SCP 工具描述硬编码为"API密钥过期"

**建议：** 更新前端代码，从后端 API 动态获取工具状态

### 2. 工具调用集成
**问题：** 当前 LLM Agent 未自动调用 SCP 工具

**建议：** 在 Agent 系统提示词中添加 SCP 工具调用指引

## 结论
SCP 工具后端已修复完成，API 调用正常。前端显示和 Agent 集成需要进一步优化。
