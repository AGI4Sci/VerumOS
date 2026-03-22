# Task 05 · Skill 系统实现

## 目标

实现可插拔的 Skill 系统，让用户和开发者可以扩展 VerumOS 的能力。

---

## Skill 架构

### 5.1 Skill 接口

```typescript
// src/skills/types.ts
interface Skill {
  // 元信息
  name: string;
  displayName: string;
  description: string;
  version: string;
  author?: string;
  category: SkillCategory;
  
  // 能力声明
  capabilities: {
    inputs: string[];      // 接受的输入类型
    outputs: string[];     // 产生的输出类型
    formats: string[];     // 支持的文件格式
    operations: string[];  // 支持的操作
  };
  
  // 依赖声明
  dependencies: {
    python?: string[];     // Python 包依赖
    node?: string[];       // Node 包依赖
    system?: string[];     // 系统依赖（如 blast, samtools）
    skills?: string[];     // 依赖的其他 Skill
  };
  
  // 工具定义（给 LLM 调用）
  tools: Tool[];
  
  // 配置模式
  configSchema?: JSONSchema;
  
  // 生命周期
  install(): Promise<void>;
  checkDependencies(): Promise<DependencyStatus>;
  
  // 执行
  execute(toolName: string, params: any, context: SkillContext): Promise<Result>;
}

type SkillCategory = 
  | "data-io"       // 数据读写
  | "data-process"  // 数据处理
  | "ml"            // 机器学习
  | "bioinfo"       // 生物信息
  | "visualization" // 可视化
  | "analysis"      // 分析工具
  | "integration";  // 集成工具
```

### 5.2 Skill 注册表

```typescript
// src/skills/registry.ts
class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private categories: Map<SkillCategory, string[]> = new Map();
  
  // 注册 Skill
  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
    
    // 按类别索引
    const category = skill.category;
    if (!this.categories.has(category)) {
      this.categories.set(category, []);
    }
    this.categories.get(category)!.push(skill.name);
  }
  
  // 获取 Skill
  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }
  
  // 按类别获取
  getByCategory(category: SkillCategory): Skill[] {
    const names = this.categories.get(category) || [];
    return names.map(n => this.skills.get(n)!);
  }
  
  // 按能力查找
  findByCapability(capability: {
    format?: string;
    operation?: string;
  }): Skill[] {
    return Array.from(this.skills.values()).filter(skill => {
      if (capability.format && !skill.capabilities.formats.includes(capability.format)) {
        return false;
      }
      if (capability.operation && !skill.capabilities.operations.includes(capability.operation)) {
        return false;
      }
      return true;
    });
  }
  
  // 获取所有工具定义
  getAllTools(): Tool[] {
    return Array.from(this.skills.values()).flatMap(s => s.tools);
  }
}
```

### 5.3 Skill 执行器

```typescript
// src/skills/executor.ts
class SkillExecutor {
  private registry: SkillRegistry;
  private localExecutor: LocalExecutor;
  private remoteExecutor: RemoteExecutor;
  
  async execute(
    skillName: string,
    toolName: string,
    params: any,
    context: SkillContext
  ): Promise<Result> {
    const skill = this.registry.get(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }
    
    // 检查依赖
    const status = await skill.checkDependencies();
    if (!status.satisfied) {
      await skill.install();
    }
    
    // 执行
    return skill.execute(toolName, params, context);
  }
}
```

---

## 内置 Skills

### csv-skill

```yaml
name: csv-skill
category: data-io
capabilities:
  formats: [".csv", ".xlsx", ".xls", ".tsv", ".parquet"]
  operations: [read, write, explore, transform, merge, filter]
dependencies:
  python: [pandas>=2.0, openpyxl, pyarrow]
tools:
  - read_file
  - write_file
  - explore_data
  - transform_data
  - merge_data
  - filter_data
```

### pytorch-skill

```yaml
name: pytorch-skill
category: ml
capabilities:
  operations: [design, generate, train, evaluate, export]
dependencies:
  python: [torch>=2.0, torchvision, torchaudio]
tools:
  - suggest_architecture
  - generate_model_code
  - generate_training_script
  - train_model
  - evaluate_model
  - export_model
```

### pubmed-skill

```yaml
name: pubmed-skill
category: bioinfo
capabilities:
  operations: [search, fetch, summarize]
dependencies: {}
tools:
  - search_papers
  - get_abstract
  - get_related
```

### enrichment-skill

```yaml
name: enrichment-skill
category: bioinfo
capabilities:
  operations: [go, kegg, reactome, custom]
dependencies:
  python: [gseapy, pandas]
tools:
  - go_analysis
  - kegg_analysis
  - reactome_analysis
  - custom_enrichment
```

---

## Skill 开发指南

### 创建新 Skill

```typescript
// skills/my-skill/index.ts
import { BaseSkill, Tool, Result, SkillContext } from '@verumos/skill-sdk';

export class MySkill extends BaseSkill {
  name = 'my-skill';
  displayName = '我的技能';
  description = '描述这个技能的功能';
  version = '1.0.0';
  category = 'analysis';
  
  capabilities = {
    inputs: ['text'],
    outputs: ['result'],
    formats: ['.txt', '.json'],
    operations: ['process', 'analyze']
  };
  
  dependencies = {
    python: ['numpy', 'pandas']
  };
  
  tools: Tool[] = [
    {
      name: 'process_text',
      description: '处理文本',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '输入文本' }
        },
        required: ['text']
      }
    }
  ];
  
  async install(): Promise<void> {
    // 安装依赖
    await this.exec('pip install numpy pandas');
  }
  
  async checkDependencies(): Promise<DependencyStatus> {
    // 检查依赖是否满足
    try {
      await this.exec('python -c "import numpy, pandas"');
      return { satisfied: true };
    } catch {
      return { satisfied: false, missing: ['numpy', 'pandas'] };
    }
  }
  
  async execute(
    toolName: string, 
    params: any, 
    context: SkillContext
  ): Promise<Result> {
    switch (toolName) {
      case 'process_text':
        return this.processText(params.text);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
  
  private async processText(text: string): Promise<Result> {
    // 实现处理逻辑
    return {
      success: true,
      data: { processed: text.toUpperCase() }
    };
  }
}

// 导出
export default new MySkill();
```

### 注册 Skill

```typescript
// skills/index.ts
import { skillRegistry } from '@verumos/core';
import MySkill from './my-skill';

skillRegistry.register(MySkill);
```

---

## Skill 配置

### 用户配置

```yaml
# ~/.verumos/skills.yaml
skills:
  csv-skill:
    enabled: true
    config:
      default_encoding: utf-8
      max_file_size: 100MB
      
  pytorch-skill:
    enabled: true
    config:
      default_device: cuda
      remote_training: true
      remote_config:
        host: h.pjlab.org.cn
        user: ${REMOTE_USER}
        
  pubmed-skill:
    enabled: true
    config:
      api_key: ${NCBI_API_KEY}  # 可选，提高速率限制
```

---

## 验收标准

1. Skill 注册表能正确注册和查找 Skill
2. Skill 能正确声明能力和依赖
3. Skill 执行器能正确调用 Skill 工具
4. 依赖检查和安装功能正常
5. 至少实现 3 个内置 Skill