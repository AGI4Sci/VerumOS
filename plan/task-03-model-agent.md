# Task 03 · Model Agent 实现

## 目标

实现 Model Agent，帮助用户设计和训练 AI 模型。

---

## 核心功能

### 3.1 模型设计建议

```typescript
// 根据数据和需求，建议模型架构
interface ModelSuggestion {
  taskType: "classification" | "regression" | "survival" | "clustering" | "generation";
  architecture: string;
  layers: LayerConfig[];
  hyperparameters: Record<string, any>;
  reasoning: string;
  alternatives: ModelSuggestion[];
}

async function suggestModel(
  dataset: Dataset,
  requirement: string
): Promise<ModelSuggestion[]> {
  // 分析数据特征
  const features = analyzeFeatures(dataset);
  
  // 根据任务类型建议模型
  const taskType = inferTaskType(requirement, features);
  
  switch (taskType) {
    case "classification":
      return suggestClassificationModel(features);
    case "survival":
      return suggestSurvivalModel(features);
    case "clustering":
      return suggestClusteringModel(features);
    // ...
  }
}
```

### 3.2 代码生成

```typescript
// 生成 PyTorch 模型代码
function generateModelCode(config: ModelConfig): string {
  return `
import torch
import torch.nn as nn

class ${config.name}(nn.Module):
    def __init__(self, ${generateInitParams(config)}):
        super().__init__()
        ${generateLayers(config.layers)}
    
    def forward(self, x):
        ${generateForward(config.layers)}
        return x

# 模型实例化
model = ${config.name}(
    ${generateModelParams(config.hyperparameters)}
)
print(model)
`;
}

// 生成训练脚本
function generateTrainingScript(config: TrainingConfig): string {
  return `
import torch
from torch.utils.data import DataLoader, TensorDataset
from model import ${config.modelName}

# 数据加载
train_loader = DataLoader(
    TensorDataset(X_train, y_train),
    batch_size=${config.batchSize},
    shuffle=True
)

# 训练配置
optimizer = torch.optim.Adam(model.parameters(), lr=${config.lr})
criterion = nn.${config.lossFunction}()

# 训练循环
for epoch in range(${config.epochs}):
    for batch_x, batch_y in train_loader:
        optimizer.zero_grad()
        output = model(batch_x)
        loss = criterion(output, batch_y)
        loss.backward()
        optimizer.step()
    
    print(f"Epoch {epoch+1}, Loss: {loss.item():.4f}")

# 保存模型
torch.save(model.state_dict(), "${config.savePath}")
`;
}
```

### 3.3 远程训练

```typescript
// src/execution/remote.ts
export class RemoteExecutor {
  private sshConfig = {
    host: "h.pjlab.org.cn",
    username: process.env.REMOTE_USER,
    // SSH 连接字符串: ssh -CAXY aivc-gzy-debug2.gaozhangyang.ailab-beam.ws@h.pjlab.org.cn
  };
  
  // 准备训练环境
  async prepareEnvironment(sessionId: string): Promise<string> {
    // 1. 连接远程服务器
    await this.connect();
    
    // 2. 创建工作目录
    const workDir = `/workspace/${sessionId}`;
    await this.execute(`mkdir -p ${workDir}`);
    
    // 3. 检查 Docker 容器
    await this.execute(`docker ps | grep ${sessionId} || docker run -d --name ${sessionId} --gpus all pytorch/pytorch`);
    
    return workDir;
  }
  
  // 上传数据和代码
  async uploadTrainingFiles(
    workDir: string,
    dataPath: string,
    codePath: string
  ): Promise<void> {
    await this.upload(dataPath, `${workDir}/data/`);
    await this.upload(codePath, `${workDir}/`);
  }
  
  // 开始训练
  async startTraining(
    sessionId: string,
    scriptPath: string
  ): Promise<TrainingHandle> {
    const command = `docker exec ${sessionId} python ${scriptPath}`;
    const result = await this.execute(command);
    
    return {
      sessionId,
      status: "running",
      logs: result.stdout
    };
  }
  
  // 获取训练进度
  async getTrainingProgress(sessionId: string): Promise<TrainingProgress> {
    const logs = await this.execute(`docker logs ${sessionId}`);
    return parseTrainingLogs(logs.stdout);
  }
  
  // 下载训练结果
  async downloadResults(
    sessionId: string,
    localPath: string
  ): Promise<void> {
    await this.download(`/workspace/${sessionId}/outputs/`, localPath);
  }
}
```

### 3.4 Model Agent 实现

```typescript
// src/agents/model-agent.ts
export class ModelAgent extends BaseAgent {
  id = "model-agent";
  name = "模型助手";
  description = "帮助用户设计和训练 AI 模型";
  
  capabilities = {
    inputs: ["dataset", "requirement"],
    outputs: ["model", "code", "report"],
    skills: ["pytorch-skill", "sklearn-skill", "transformers-skill"]
  };
  
  async processMessage(
    message: string, 
    context: ConversationContext
  ): Promise<AgentResponse> {
    const intent = await this.analyzeIntent(message);
    
    switch (intent.type) {
      case "design":
        return await this.handleDesign(intent, context);
      case "train":
        return await this.handleTrain(intent, context);
      case "evaluate":
        return await this.handleEvaluate(intent, context);
      case "question":
        return await this.handleQuestion(intent, context);
      default:
        return { type: "text", content: "你想构建什么样的模型？" };
    }
  }
  
  private async handleDesign(
    intent: Intent, 
    context: ConversationContext
  ): Promise<AgentResponse> {
    // 获取数据集信息
    const dataset = context.datasets.get(intent.datasetId);
    if (!dataset) {
      return { type: "text", content: "请先准备数据" };
    }
    
    // 分析数据，建议模型
    const suggestions = await this.suggestModel(dataset, intent.requirement);
    
    // 生成建议报告
    const report = this.generateDesignReport(suggestions);
    
    return {
      type: "question",
      content: report,
      questions: [{
        id: "model_choice",
        text: "请选择模型架构：",
        options: suggestions.map((s, i) => ({
          label: s.architecture,
          value: i,
          description: s.reasoning
        }))
      }]
    };
  }
  
  private async handleTrain(
    intent: Intent, 
    context: ConversationContext
  ): Promise<AgentResponse> {
    const modelConfig = context.models.get(intent.modelId);
    
    // 判断是否需要远程训练
    const needsRemote = this.needsRemoteTraining(modelConfig);
    
    if (needsRemote) {
      // 确认用户同意上传数据
      return {
        type: "question",
        content: "这个模型需要 GPU 训练，需要将数据上传到远程集群。是否继续？",
        questions: [{
          id: "confirm_remote",
          text: "确认使用远程集群训练？",
          options: [
            { label: "是，开始训练", value: true },
            { label: "否，取消", value: false }
          ]
        }]
      };
    }
    
    // 本地训练
    return await this.startLocalTraining(modelConfig, context);
  }
  
  private async startRemoteTraining(
    modelConfig: ModelConfig,
    context: ConversationContext
  ): Promise<AgentResponse> {
    // 1. 准备远程环境
    const workDir = await remoteExecutor.prepareEnvironment(context.sessionId);
    
    // 2. 生成代码
    const code = this.generateTrainingCode(modelConfig);
    
    // 3. 上传数据和代码
    await remoteExecutor.uploadTrainingFiles(
      workDir,
      modelConfig.dataPath,
      code
    );
    
    // 4. 开始训练
    const handle = await remoteExecutor.startTraining(
      context.sessionId,
      "train.py"
    );
    
    return {
      type: "action",
      content: "训练已开始，正在远程集群运行...",
      actions: [{
        type: "training_started",
        handle
      }]
    };
  }
}
```

---

## Skills 实现

### pytorch-skill

```typescript
// skills/pytorch-skill/index.ts
export class PyTorchSkill extends BaseSkill {
  name = "pytorch-skill";
  description = "PyTorch 深度学习模型构建";
  version = "1.0.0";
  
  capabilities = {
    formats: [".pt", ".pth", ".onnx"],
    operations: ["design", "generate", "train", "evaluate", "export"]
  };
  
  dependencies = {
    python: ["torch>=2.0", "torchvision", "torchaudio"]
  };
  
  tools = [
    {
      name: "suggest_architecture",
      description: "根据数据特征建议模型架构",
      parameters: { /* ... */ }
    },
    {
      name: "generate_model_code",
      description: "生成 PyTorch 模型代码",
      parameters: { /* ... */ }
    },
    {
      name: "generate_training_script",
      description: "生成训练脚本",
      parameters: { /* ... */ }
    },
    {
      name: "train_model",
      description: "训练模型",
      parameters: { /* ... */ }
    }
  ];
}
```

---

## 对话示例

```
用户: 我想用刚才整合的数据构建一个预测患者预后的模型

Model Agent: 好的，让我分析一下数据特征...
[分析数据]

📊 数据特征：
- 样本数：373
- 特征数：20,546（基因表达 + 临床特征）
- 目标变量：OS_time, OS_status（生存数据）

🧠 建议模型架构：

方案 1：Cox 比例风险模型 + Transformer 编码器
- 用 Transformer 处理高维基因表达
- MLP 融合临床特征
- Cox loss 预测生存风险
- 优点：能处理高维稀疏数据，可解释性好

方案 2：DeepSurv（深度生存网络）
- 全连接网络 + Cox loss
- 简单高效，适合中小样本
- 优点：训练快，易于调参

方案 3：Random Survival Forest
- 传统机器学习方法
- 不需要深度学习环境
- 优点：可解释性强，不需要 GPU

你想用哪个方案？

用户: 用方案 1，Transformer

Model Agent: 好的，我来生成代码...
[生成模型代码]

✅ 模型代码已生成：
- models/survival_transformer.py
- train.py
- config.yaml

📋 模型配置：
- Transformer 层数：4
- 注意力头数：8
- 隐藏维度：256
- Dropout：0.1

你想修改配置吗？还是直接开始训练？

用户: 开始训练

Model Agent: 这个模型需要 GPU 训练。
我将使用远程集群（h.pjlab.org.cn）进行训练。

⚠️ 数据将上传到远程服务器，是否继续？

用户: 是

Model Agent: 好的，正在准备训练环境...
[连接远程集群]
[上传数据和代码]

✅ 训练已开始！

📊 训练进度：
Epoch 1/100 - Loss: 2.34 - C-index: 0.52
Epoch 10/100 - Loss: 1.87 - C-index: 0.61
Epoch 20/100 - Loss: 1.45 - C-index: 0.68
...

[实时更新训练进度]

✅ 训练完成！
- 测试集 C-index: 0.82
- 最佳模型已保存：models/best_model.pth

📊 关键基因注意力：
1. TP53 (attention: 0.12)
2. BRCA1 (attention: 0.09)
3. CDK4 (attention: 0.07)

你想进一步分析结果吗？
```

---

## 验收标准

1. 能根据数据特征建议模型架构
2. 能生成可运行的 PyTorch 代码
3. 能连接远程集群进行训练
4. 能实时返回训练进度
5. 能下载训练结果