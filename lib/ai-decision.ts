/**
 * AI Decision Engine
 *
 * Interfaces with the AI agent to make strategic hit/stand decisions.
 * This is the ONLY place where AI reasoning is used in autonomous play.
 */

import { generateText } from "ai";
import { createAgent } from "../app/api/agent/create-agent";

interface CardDisplay {
  rank: string;
  suit: string;
  value: number;
}

interface GameState {
  playerCards: CardDisplay[];
  playerTotal: number;
  dealerCards: CardDisplay[];
  dealerTotal: number;
  canHit: boolean;
  canStand: boolean;
}

/**
 * Basic strategy fallback (used if AI fails)
 * Hit on 16 or below, stand on 17 or above
 */
function basicStrategy(playerTotal: number): "hit" | "stand" {
  return playerTotal < 17 ? "hit" : "stand";
}

/**
 * Format game state for AI prompt
 */
function formatGameState(state: GameState): string {
  const playerCardsStr = state.playerCards.map((c) => `${c.rank}${c.suit}`).join(" ");
  const dealerCardsStr = state.dealerCards.map((c) => `${c.rank}${c.suit}`).join(" ");

  return `
**Current Hand:**
- Your cards: ${playerCardsStr} (Total: ${state.playerTotal})
- Dealer's cards: ${dealerCardsStr} (Total: ${state.dealerTotal})

**Available Actions:**
- Can Hit: ${state.canHit}
- Can Stand: ${state.canStand}

Should you HIT or STAND? Respond with ONLY one word: "hit" or "stand".
`.trim();
}

/**
 * Ask AI to decide whether to hit or stand
 * Falls back to basic strategy if AI fails or is ambiguous
 */
export async function decideHitOrStand(gameState: GameState): Promise<"hit" | "stand"> {
  try {
    console.log("\n🤖 Asking AI for strategic decision...");
    console.log(`Player: ${gameState.playerTotal}, Dealer: ${gameState.dealerTotal}`);

    // Create the agent
    const { system, model, tools } = await createAgent();

    // Create AI prompt
    const prompt = formatGameState(gameState);

    // Get AI response
    const result = await generateText({
      model,
      tools,
      system,
      prompt,
      maxSteps: 3, // Limit steps for quick decision
    });

    const response = result.text.toLowerCase().trim();
    console.log(`🤖 AI Response: "${response}"`);

    // Parse response
    if (response.includes("hit") && !response.includes("stand")) {
      console.log("✅ AI Decision: HIT");
      return "hit";
    } else if (response.includes("stand")) {
      console.log("✅ AI Decision: STAND");
      return "stand";
    } else {
      // Ambiguous response, use fallback
      console.log("⚠️  AI response unclear, using basic strategy fallback");
      const decision = basicStrategy(gameState.playerTotal);
      console.log(`✅ Fallback Decision: ${decision.toUpperCase()}`);
      return decision;
    }
  } catch (error) {
    console.error("❌ AI decision failed:", error);
    console.log("⚠️  Using basic strategy fallback");
    const decision = basicStrategy(gameState.playerTotal);
    console.log(`✅ Fallback Decision: ${decision.toUpperCase()}`);
    return decision;
  }
}

/**
 * Simplified function for autonomous play
 * Returns the action to take: "hit" or "stand"
 */
export async function getNextAction(
  playerTotal: number,
  dealerTotal: number,
  playerCards: CardDisplay[],
  dealerCards: CardDisplay[],
  canHit: boolean,
  canStand: boolean
): Promise<"hit" | "stand"> {
  const gameState: GameState = {
    playerCards,
    playerTotal,
    dealerCards,
    dealerTotal,
    canHit,
    canStand,
  };

  return await decideHitOrStand(gameState);
}
