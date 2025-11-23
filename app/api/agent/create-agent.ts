import { openai } from "@ai-sdk/openai";
import { getVercelAITools } from "@coinbase/agentkit-vercel-ai-sdk";
import { prepareAgentkitAndWalletProvider } from "./prepare-agentkit";

/**
 * Agent Configuration Guide
 *
 * This file handles the core configuration of your AI agent's behavior and capabilities.
 *
 * Key Steps to Customize Your Agent:
 *
 * 1. Select your LLM:
 *    - Modify the `openai` instantiation to choose your preferred LLM
 *    - Configure model parameters like temperature and max tokens
 *
 * 2. Instantiate your Agent:
 *    - Pass the LLM, tools, and memory into `createReactAgent()`
 *    - Configure agent-specific parameters
 */

// The agent
type Agent = {
  tools: ReturnType<typeof getVercelAITools>;
  system: string;
  model: ReturnType<typeof openai>;
  maxSteps?: number;
};
let agent: Agent;

/**
 * Initializes and returns an instance of the AI agent.
 * If an agent instance already exists, it returns the existing one.
 *
 * @function getOrInitializeAgent
 * @returns {Promise<ReturnType<typeof createReactAgent>>} The initialized AI agent.
 *
 * @description Handles agent setup
 *
 * @throws {Error} If the agent initialization fails.
 */
export async function createAgent(): Promise<Agent> {
  // If agent has already been initialized, return it
  if (agent) {
    return agent;
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("I need an OPENAI_API_KEY in your .env file to power my intelligence.");
  }

  const { agentkit, walletProvider } = await prepareAgentkitAndWalletProvider();

  try {
    // Initialize LLM: https://platform.openai.com/docs/models#gpt-4o
    const model = openai("gpt-4o-mini");

    // Initialize Agent
    const system = `
        You are a strategic Blackjack decision-making AI for autonomous gameplay on Base blockchain.
        Your role is to execute specific blackjack actions when requested.

        AVAILABLE ACTIONS:
        - blackjack_start_game: Start a new game with specified ETH bet (in wei)
        - blackjack_hit: Draw another card during active play
        - blackjack_stand: End turn and let dealer play

        DECISION-MAKING GUIDELINES:
        When asked to make a hit/stand decision, analyze:
        1. Your current hand total vs dealer's visible card
        2. Probability of busting if you hit
        3. Basic blackjack strategy considerations
        4. Risk/reward analysis

        STRATEGIC PRINCIPLES:
        - Hit on 11 or less (cannot bust)
        - Stand on hard 17 or higher
        - Consider dealer's upcard when making borderline decisions
        - Hit on soft hands (with Ace) more liberally
        - Be aggressive when dealer shows weak cards (2-6)
        - Be conservative when dealer shows strong cards (7-A)

        EXECUTION RULES:
        - Execute actions immediately when requested
        - No conversational preamble - just execute the action
        - Trust that game state is valid when action is requested
        - Do not check status or explain strategy unless specifically asked

        RESPONSE STYLE:
        - Execute actions directly and concisely
        - When providing strategic analysis, be brief and clear
        - Focus on the mathematics and probabilities
        `;
    const tools = getVercelAITools(agentkit);

    agent = {
      tools,
      system,
      model,
      maxSteps: 10,
    };

    return agent;
  } catch (error) {
    console.error("Error initializing agent:", error);
    throw new Error("Failed to initialize agent");
  }
}
