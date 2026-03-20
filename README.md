# BioAgent · 阶段一 Demo

这个仓库现在提供了一个可直接运行的“阶段一 · 可信科研副驾驶”最小闭环 demo，目标不是再做一个通用 biomedical agent 壳层，而是把路线图里最关键的六个输出模块真正对象化并跑通前后端：

- 当前建议
- 支持证据
- 反对证据
- 时效 / 争议状态
- 已知无效路径
- 专家修正版判断

同时，阶段一要求沉积的三类核心资产也已经作为独立对象接入：

- 专家纠偏轨迹
- 有时间轴的知识节点
- 阴性结果 / 无效路径库

## 项目结构

```text
BioAgent/
├── backend/
│   └── server.py
├── data/
│   └── stage1_demo_data.json
├── demo/
│   └── biomedical_agent_demo.html
├── biomedical_ai_roadmap.html
├── prompt.md
└── README.md
```

## 当前实现了什么

### 1. 前后端打通

- 前端页面不再是纯静态稿，而是通过 `fetch` 调用后端 API。
- 后端使用 Python 标准库实现，无额外依赖。
- 服务启动后访问根路径 `/`，会自动打开 stage 1 demo 页面。

### 2. 阶段一对象 schema

当前锁定了两个核心 Agent 之间的接口契约：

`Data Object` 必填字段：

- `source`
- `created_at`
- `quality_score`
- `processing_history`
- `ontology_tags`

`Model Object` 必填字段：

- `result`
- `reasoning_trace`
- `model_params`
- `excluded_paths`
- `protocol_version`
- `created_at`

这和 `prompt.md` 中“schema 在开发启动前锁定，不得单边修改”的要求一致。

### 3. 阶段一闭环能力

当前 demo 已经具备：

- Data Agent 卡片：展示标准化后的 `Data Object`
- Model Agent 卡片：展示 `Model Object` 与排除路径
- 决策输出区：完整呈现六个阶段一核心模块
- Reasoning Trace：展示推理步骤与专家介入点
- Shared Asset Store：三类阶段一资产同时可见
- Expert Intervention：可以通过前端表单写入新的专家修正，并实时更新页面状态

### 4. 多场景演示

当前内置了两个可切换场景：

- `TIGIT 在肝癌 TME 中的优先级建议`
- `KRAS 合成致死线索在 PDAC 中的可信筛选`

这样可以说明这不是单一页面设计，而是一种可复用的判断结构。

## 运行方式

在仓库根目录执行：

```bash
python3 backend/server.py
```

默认启动在：

```text
http://127.0.0.1:8000
```

自定义端口：

```bash
python3 backend/server.py --port 8080
```

## API 说明

### `GET /api/bootstrap`

返回：

- 应用基础信息
- 默认场景与默认问题
- schema 摘要
- Shared Asset Store 总指标
- 场景列表

### `POST /api/run-analysis`

请求体示例：

```json
{
  "scenario_id": "tigit_hcc",
  "query": "TIGIT 在肝癌肿瘤微环境中的表达模式，是否足以支持其进入下一轮靶点优先级验证？",
  "mode": "precision",
  "priority": "target-prioritization"
}
```

返回：

- 当前场景完整对象
- 最新资产计数

### `POST /api/expert-correction`

请求体示例：

```json
{
  "scenario_id": "tigit_hcc",
  "expert": "王磊 教授",
  "from": "Cluster 7 = Tem",
  "to": "Cluster 7 = Tpex",
  "reason": "PDCD1、TCF7、TOX 共表达更符合耗竭前体 T 细胞。"
}
```

返回：

- 写入修正后的当前场景对象
- 更新后的资产计数

## 和 OpenClaw 的兼容思路

这次实现特意保持了“最小但可迁移”的结构，方便后续向 `/Applications/workspace/ailab/research/claw/openclaw` 的能力靠拢：

- `Data Object / Model Object / Asset Store` 被明确拆成接口边界，便于未来挂接真正的 agent runner
- `protocol_version` 被单独保留，方便以后接协议注册表或 skill 选择器
- 前端只依赖统一 API，而不是把业务逻辑写死在页面里，后续替换成真实执行层成本更低
- Shared Asset Store 和场景对象分离，后续可以换成数据库、对象存储或知识图谱后端

目前没有直接复用 OpenClaw 内部模块，原因是这版仓库目标是“先完成阶段一必需功能，避免冗余”。但接口组织方式已经尽量朝兼容方向收敛。

## 后续建议

如果你要把这版 demo 继续推进成更完整的 agent 项目，推荐按下面顺序做：

1. 把 `data/stage1_demo_data.json` 换成真实存储层
2. 用真实的 Data Agent / Model Agent 执行器替换 mock 返回
3. 给专家修正、知识节点、阴性结果加版本和检索能力
4. 把文献证据链与 protocol 选择拆成独立服务
5. 再启动数据分析 agent 的并行开发

## 本地验证

我已经验证过：

- `python3 -m py_compile backend/server.py`
- `data/stage1_demo_data.json` JSON 解析通过

如果你希望，我下一步可以继续把这套 demo 再向“真实可扩展项目骨架”推进一层，例如：

- 补一个更正式的后端目录结构
- 抽出 API schema 文件
- 加一个简单的持久化层
- 或者直接对接你想参考的 OpenClaw 模块接口
