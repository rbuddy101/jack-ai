/**
 * RPC Client Factory (Node.js Runtime Only)
 *
 * Creates RPC client instances using the shared wallet provider.
 * Separated from rpc-client.ts to avoid Node.js module imports in Edge Runtime.
 */

import { CdpSmartWalletProvider } from "@coinbase/agentkit";
import { BlackjackRPCClient } from "./rpc-client";

/**
 * Create RPC client instance
 * Reuses the wallet provider from prepare-agentkit to avoid creating multiple wallets
 *
 * ⚠️ WARNING: This uses Node.js 'fs' module via prepare-agentkit.
 * Do NOT import this in Edge Runtime routes (e.g., SSE streams).
 */
export async function createRPCClient(): Promise<BlackjackRPCClient> {
  if (!process.env.AI_WALLET) {
    throw new Error("AI_WALLET not set in environment");
  }

  if (!process.env.BLACKJACK_CONTRACT_ADDRESS) {
    throw new Error("BLACKJACK_CONTRACT_ADDRESS not set in environment");
  }

  if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
    throw new Error("CDP API credentials not set in environment");
  }

  // Import prepare-agentkit to get the wallet provider
  const { walletProvider } = await import("../app/api/agent/prepare-agentkit").then(
    (mod) => mod.prepareAgentkitAndWalletProvider()
  );

  const contractAddress = process.env.BLACKJACK_CONTRACT_ADDRESS;
  const playerAddress = process.env.AI_WALLET;

  if (!contractAddress || !playerAddress) {
    throw new Error("Missing required environment variables: BLACKJACK_CONTRACT_ADDRESS and AI_WALLET");
  }

  return new BlackjackRPCClient(
    walletProvider as CdpSmartWalletProvider,
    contractAddress,
    playerAddress
  );
}
