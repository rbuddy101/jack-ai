/**
 * Player Stats API Endpoint
 *
 * GET /api/stats - Returns player statistics from blockchain
 */

import { CdpSmartWalletProvider } from "@coinbase/agentkit";
import { BlackjackRPCClient } from "@/lib/rpc-client";

export async function GET() {
  try {
    if (!process.env.AI_WALLET) {
      return Response.json({ success: false, error: "AI_WALLET not configured" }, { status: 500 });
    }

    if (!process.env.BLACKJACK_CONTRACT_ADDRESS) {
      return Response.json({ success: false, error: "BLACKJACK_CONTRACT_ADDRESS not configured" }, { status: 500 });
    }

    // Initialize wallet provider
    const walletProvider = await CdpSmartWalletProvider.configureWithWallet({
      apiKeyId: process.env.CDP_API_KEY_ID!,
      apiKeySecret: process.env.CDP_API_KEY_SECRET!,
      walletSecret: process.env.CDP_WALLET_SECRET,
      networkId: process.env.NETWORK_ID || "base-sepolia",
    });

    // Use AI_WALLET address (EOA) not smart wallet address
    const playerAddress = process.env.AI_WALLET;
    const contractAddress = process.env.BLACKJACK_CONTRACT_ADDRESS;

    if (!contractAddress || !playerAddress) {
      throw new Error("Missing required environment variables: BLACKJACK_CONTRACT_ADDRESS and AI_WALLET");
    }

    // Initialize RPC client
    const rpcClient = new BlackjackRPCClient(walletProvider, contractAddress, playerAddress);

    // Fetch stats directly from blockchain
    const stats = await rpcClient.getPlayerStats();

    // Convert BigInt to number for JSON serialization
    const serializedStats = {
      gamesPlayed: Number(stats.gamesPlayed),
      wins: Number(stats.gamesWon),
      losses: Number(stats.gamesLost),
      pushes: Number(stats.gamesPushed),
      busts: Number(stats.playerBusts),
      winRate: stats.winRate,
    };

    return Response.json({
      success: true,
      stats: serializedStats,
      playerAddress,
    });
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
