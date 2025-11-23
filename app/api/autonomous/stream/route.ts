/**
 * Server-Sent Events (SSE) Stream for Real-Time Updates
 *
 * Provides real-time game events to the dashboard.
 *
 * NOTE: Cannot use Edge Runtime due to @coinbase/agentkit using Node.js 'fs' module.
 * Uses Node.js runtime with Vercel timeout limits:
 * - Free/Hobby: 15 seconds max
 * - Pro: 5 minutes max (requires config in vercel.json)
 *
 * For production with longer streams, consider:
 * 1. Upgrading to Vercel Pro
 * 2. Using a separate WebSocket server
 * 3. Client-side polling as fallback
 */

import autonomousPlayer from "@/lib/autonomous-player";
import { GameLoopEvent } from "@/lib/game-loop";
import { CdpSmartWalletProvider } from "@coinbase/agentkit";
import { BlackjackRPCClient } from "@/lib/rpc-client";

/**
 * Fetch real stats from blockchain
 */
async function fetchRealStats() {
  const walletProvider = await CdpSmartWalletProvider.configureWithWallet({
    apiKeyId: process.env.CDP_API_KEY_ID!,
    apiKeySecret: process.env.CDP_API_KEY_SECRET!,
    walletSecret: process.env.CDP_WALLET_SECRET,
    networkId: process.env.NETWORK_ID || "base-sepolia",
  });

  const playerAddress = process.env.AI_WALLET;
  const contractAddress = process.env.BLACKJACK_CONTRACT_ADDRESS;

  if (!contractAddress || !playerAddress) {
    throw new Error("Missing required environment variables: BLACKJACK_CONTRACT_ADDRESS and AI_WALLET");
  }

  const rpcClient = new BlackjackRPCClient(walletProvider, contractAddress, playerAddress);
  const stats = await rpcClient.getPlayerStats();

  return {
    gamesPlayed: Number(stats.gamesPlayed),
    wins: Number(stats.gamesWon),
    losses: Number(stats.gamesLost),
    pushes: Number(stats.gamesPushed),
    busts: Number(stats.playerBusts),
    winRate: stats.winRate,
    currentStreak: 0, // Not provided by contract stats
    longestWinStreak: 0, // Not provided by contract stats
    longestLossStreak: 0, // Not provided by contract stats
  };
}

/**
 * GET /api/autonomous/stream - SSE endpoint for real-time updates
 */
export async function GET() {
  // Create SSE stream
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const initMessage = `data: ${JSON.stringify({
        type: "connected",
        timestamp: Date.now(),
      })}\n\n`;
      controller.enqueue(encoder.encode(initMessage));

      // Send initial status immediately on connection
      (async () => {
        try {
          const status = await autonomousPlayer.getStatus();
          // Fetch real stats from blockchain
          const realStats = await fetchRealStats();

          // Convert BigInt to string for JSON serialization
          const serializableStatus = {
            ...status,
            currentGameId: status.currentGameId?.toString() || null,
            stats: realStats, // Use real blockchain stats
          };

          const message = `data: ${JSON.stringify({
            type: "status_update",
            data: serializableStatus,
            timestamp: Date.now(),
          })}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (error) {
          console.error("Initial status fetch error:", error);
        }
      })();

      // Event listener for game events
      const eventListener = (event: GameLoopEvent) => {
        const message = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Subscribe to events
      autonomousPlayer.on(eventListener);

      // Send periodic status updates
      const statusInterval = setInterval(async () => {
        try {
          const status = await autonomousPlayer.getStatus();
          // Fetch real stats from blockchain
          const realStats = await fetchRealStats();

          // Convert BigInt to string for JSON serialization
          const serializableStatus = {
            ...status,
            currentGameId: status.currentGameId?.toString() || null,
            stats: realStats, // Use real blockchain stats
          };

          const message = `data: ${JSON.stringify({
            type: "status_update",
            data: serializableStatus,
            timestamp: Date.now(),
          })}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (error) {
          console.error("Status update error:", error);
        }
      }, 5000); // Every 5 seconds

      // Cleanup on disconnect
      const cleanup = () => {
        clearInterval(statusInterval);
        autonomousPlayer.off(eventListener);
        controller.close();
      };

      // Handle client disconnect
      // Note: This is a simple implementation. In production, you'd want
      // more robust connection tracking.
      setTimeout(() => {
        // Placeholder for connection tracking
      }, 0);

      return () => cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
