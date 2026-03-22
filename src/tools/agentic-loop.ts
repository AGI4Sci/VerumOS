import OpenAI from "openai";
import { executeTool } from "./executor.js";
import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

// Initialize OpenAI client with custom base URL
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
});

const MAX_TOOL_ROUNDS = 8;

export interface AgenticLoopParams {
  system: string;
  userMsg: string;
  tools: ChatCompletionTool[];
  model?: string;
}

export async function runAgenticLoop(params: AgenticLoopParams): Promise<string> {
  const model = params.model ?? process.env.LLM_MODEL ?? "glm-5";

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "user", content: params.userMsg },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: params.system },
        ...messages,
      ],
      tools: params.tools,
    });

    const choice = response.choices[0];
    const finishReason = choice.finish_reason;
    const message = choice.message;

    // Add assistant message to history
    messages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: message.tool_calls?.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
    });

    // Check if we're done
    if (finishReason === "stop" || !message.tool_calls?.length) {
      return message.content ?? "";
    }

    // Execute tool calls
    if (message.tool_calls?.length) {
      const toolResults = await Promise.all(
        message.tool_calls.map(async (toolCall) => {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await executeTool(toolCall.function.name, args);
            return {
              tool_call_id: toolCall.id,
              output: result,
            };
          } catch (err) {
            return {
              tool_call_id: toolCall.id,
              output: `Error: ${String(err)}`,
            };
          }
        })
      );

      // Add tool results to messages
      for (const tr of toolResults) {
        messages.push({
          role: "tool",
          tool_call_id: tr.tool_call_id,
          content: tr.output,
        });
      }
    }
  }

  throw new Error("Agentic loop reached max rounds without completion");
}