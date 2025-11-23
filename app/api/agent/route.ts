import { AgentRequest, AgentResponse } from "@/app/types/api";
import { NextResponse } from "next/server";
import { createAgent } from "./create-agent";
import { Message, generateId, generateText } from "ai";

const messages: Message[] = [];

/**
 * Handles incoming POST requests to interact with the AgentKit-powered AI agent.
 * This function processes user messages and streams responses from the agent.
 *
 * @function POST
 * @param {Request & { json: () => Promise<AgentRequest> }} req - The incoming request object containing the user message.
 * @returns {Promise<NextResponse<AgentResponse>>} JSON response containing the AI-generated reply or an error message.
 *
 * @description Sends a single message to the agent and returns the agents' final response.
 *
 * @example
 * const response = await fetch("/api/agent", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ userMessage: input }),
 * });
 */
export async function POST(
  req: Request & { json: () => Promise<AgentRequest> },
): Promise<NextResponse<AgentResponse>> {
  try {
    // 1️. Extract user message from the request body
    const { userMessage } = await req.json();
    console.log("\n🔵 === New User Message ===");
    console.log("Message:", userMessage);

    // 2. Get the agent
    const agent = await createAgent();

    // 3.Start streaming the agent's response
    messages.push({ id: generateId(), role: "user", content: userMessage });

    console.log("\n🤖 === Agent Processing ===");
    console.log("Messages in conversation:", messages.length);

    const result = await generateText({
      ...agent,
      messages,
      onStepFinish: (step) => {
        // Log each step the agent takes
        console.log("\n⚡ === Agent Step ===");
        console.log("Step type:", step.stepType);

        if (step.toolCalls && step.toolCalls.length > 0) {
          console.log("\n🔧 === Tool Calls ===");
          step.toolCalls.forEach((toolCall, index) => {
            console.log(`\n[Tool Call ${index + 1}]`);
            console.log("Tool:", toolCall.toolName);
            console.log("Arguments:", JSON.stringify(toolCall.args, null, 2));
          });
        }

        if (step.toolResults && step.toolResults.length > 0) {
          console.log("\n✅ === Tool Results ===");
          step.toolResults.forEach((result: any, index: number) => {
            console.log(`\n[Result ${index + 1}]`);
            console.log("Tool:", result.toolName);
            console.log("Status:", result.result ? "Success" : "Error");

            // Try to parse and format the result
            try {
              const parsedResult = typeof result.result === 'string'
                ? JSON.parse(result.result)
                : result.result;

              // Log transaction details if present
              if (parsedResult.transactionHash) {
                console.log("Transaction Hash:", parsedResult.transactionHash);
              }
              if (parsedResult.transactionLink) {
                console.log("Transaction Link:", parsedResult.transactionLink);
              }
              if (parsedResult.balance !== undefined) {
                console.log("Balance:", parsedResult.balance);
              }

              console.log("Full Result:", JSON.stringify(parsedResult, null, 2));
            } catch {
              // If not JSON, just log the raw result
              console.log("Result:", result.result);
            }
          });
        }

        if (step.text) {
          console.log("\n💬 === Agent Response ===");
          console.log(step.text);
        }
      },
    });

    const { text } = result;

    // 4. Add the agent's response to the messages
    messages.push({ id: generateId(), role: "assistant", content: text });

    console.log("\n✨ === Final Response ===");
    console.log("Response length:", text.length, "characters");
    console.log("\n" + "=".repeat(80) + "\n");

    // 5️. Return the final response
    return NextResponse.json({ response: text });
  } catch (error) {
    console.error("\n❌ === Error ===");
    console.error("Error processing request:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "N/A");
    return NextResponse.json({
      error:
        error instanceof Error
          ? error.message
          : "I'm sorry, I encountered an issue processing your message. Please try again later.",
    });
  }
}
