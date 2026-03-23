/**
 * Tool Registry - 工具注册表
 *
 * 职责：
 * - 注册 Tool
 * - 查找 Tool
 * - 执行 Tool
 *
 * Tool 是 LLM 可 function_call 的原子操作。
 * ToolRegistry 管理所有 Tool 的执行函数。
 */

import type { ToolDef, ToolCall, ToolResult, ToolContext } from '../types.js';

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();

  /**
   * 注册 Tool
   */
  register(tool: ToolDef): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 批量注册 Tools
   */
  registerAll(tools: ToolDef[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 获取 Tool
   */
  getTool(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  /**
   * 检查 Tool 是否存在
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取所有 Tool
   */
  getAllTools(): ToolDef[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取所有 Tool 名称
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 执行 Tool
   */
  async execute(toolCall: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.name);

    if (!tool) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: null,
        error: `Tool not found: ${toolCall.name}`,
      };
    }

    try {
      const result = await tool.execute(toolCall.arguments, ctx);
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result,
      };
    } catch (error) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 批量执行 Tools
   */
  async executeAll(toolCalls: ToolCall[], ctx: ToolContext): Promise<ToolResult[]> {
    return Promise.all(toolCalls.map((tc) => this.execute(tc, ctx)));
  }

  /**
   * 转换为 LLM 可用的工具格式（OpenAI function calling 格式）
   */
  toLLMTools(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    return Array.from(this.tools.values()).map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * 注销 Tool
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 清空所有 Tools
   */
  clear(): void {
    this.tools.clear();
  }
}

/**
 * 全局 Tool 注册表实例
 */
export const toolRegistry = new ToolRegistry();
