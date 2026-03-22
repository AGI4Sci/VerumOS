# VerumOS 开发指令

## 项目概述

VerumOS 是一个科研 AI 操作系统，通过对话式交互帮助科研人员完成数据处理、模型构建、结果分析等工作。

## 当前状态

| 模块 | 状态 |
|------|------|
| 架构设计 | ✅ 已完成 |
| 前端 Demo | ✅ 已完成 |
| 实现计划 | ✅ 已完成 |
| 后端实现 | 🔲 待开发 |

## 技术栈

| 层次 | 选型 |
|------|------|
| 前端 | HTML/CSS/JS |
| 后端 | TypeScript + Hono |
| Agent 编排 | LangChain / 自研 |
| 本地执行 | Node.js + Python |
| 远程执行 | SSH + Docker |
| LLM | OpenAI 兼容 API (glm-5) |

## LLM API 配置

```
api_key: sk-GZlfkTrS1BStAtfSLBM94NL6L2MiBrQOCz39c4jXQ4H5jMzG
base_url: http://35.220.164.252:3888/v1
model: glm-5
```

## 远程集群配置

```
SSH: ssh -CAXY aivc-gzy-debug2.gaozhangyang.ailab-beam.ws@h.pjlab.org.cn
```

## 开发任务

详见 `plan/` 目录：

| 任务 | 说明 |
|------|------|
| Task 01 | 核心平台搭建 |
| Task 02 | Data Agent 实现 |
| Task 03 | Model Agent 实现 |
| Task 04 | Analysis Agent 实现 |
| Task 05 | Skill 系统实现 |

## 工作流程

1. 阅读 `plan/README.md` 了解架构
2. 按任务顺序实现
3. 更新 README.md 反映进度
4. 提交并推送代码

---

**工作结束后必需修改相关文件和 README.md, 使得项目状态与描述一致, 最后然后 push 到 git**