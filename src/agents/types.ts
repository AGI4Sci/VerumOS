export interface AgentCapabilities {
  inputs: string[];
  outputs: string[];
  skills: string[];
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  capabilities: AgentCapabilities;
  processMessage(message: string, context: ConversationContext): Promise<AgentResponse>;
}

export interface ConversationContext {
  sessionId: string;
  messages: Message[];
  datasets: Map<string, Dataset>;
  activeDatasetId?: string;
  currentIntent?: Intent;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface DatasetShape {
  rows: number;
  columns: number;
}

export interface DatasetColumn {
  name: string;
  type: string;
  unique?: number;
  nullable?: boolean;
}

export interface DatasetMetadata {
  path?: string;
  shape?: DatasetShape;
  columns?: DatasetColumn[];
  statistics?: {
    numeric: Record<string, unknown>;
    categorical: Record<string, unknown>;
  };
  missing?: Record<string, number>;
  quality?: Record<string, unknown>;
  preview?: Record<string, unknown>[];
  [key: string]: unknown;
}

export interface Dataset {
  id: string;
  name: string;
  path: string;
  format: string;
  skill: string;
  metadata?: DatasetMetadata;
}

export type IntentType = 'upload' | 'explore' | 'transform' | 'merge' | 'question' | 'requirement' | 'execute' | 'unknown';

export interface Intent {
  type: IntentType;
  confidence: number;
  datasetId?: string;
  params?: Record<string, unknown>;
}

export type AgentResponseType = 'text' | 'result' | 'question';

export interface AgentResponse {
  type: AgentResponseType;
  content: string;
  result?: unknown;
  questions?: Question[];
}

export interface Question {
  id: string;
  text: string;
  options?: QuestionOption[];
}

export interface QuestionOption {
  label: string;
  value: string | number | boolean;
}

/**
 * 意图规则（用于启发式匹配）
 */
export interface IntentRule {
  intent: IntentType | string;
  patterns: RegExp[];
  confidence?: number;
  description?: string;
}

/**
 * Agent 意图声明
 */
export interface AgentIntentDeclaration {
  types: string[];
  rules: IntentRule[];
}
