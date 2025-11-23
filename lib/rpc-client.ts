/**
 * RPC Client for Direct Blockchain Interactions
 *
 * Provides direct contract read/write operations without AI overhead.
 * Used for efficient status checks and claiming operations.
 */

import { CdpSmartWalletProvider } from "@coinbase/agentkit";
import { encodeFunctionData } from "viem";
import BlackjackAbi from "../Blackjackabi.json";

// Types from the blackjack action provider
interface CardDisplay {
  rank: string;
  suit: string;
  value: number;
}

interface GameDisplay {
  status: string;
  playerCards: CardDisplay[];
  playerTotal: number;
  dealerCards: CardDisplay[];
  dealerTotal: number;
  canHit: boolean;
  canStand: boolean;
  canStartNew: boolean;
  canCancelStuck: boolean;
  canAdminResolve: boolean;
  startedAt: bigint;
  lastActionAt: bigint;
  tradingPeriodEnds: bigint;
  secondsUntilCanAct: bigint;
  gameId: bigint;
}

interface QuickStatus {
  state: string;
  playerTotal: number;
  dealerTotal: number;
  canAct: boolean;
  tradingPeriodEnds: bigint;
}

interface PlayerStats {
  gamesPlayed: bigint;
  gamesWon: bigint;
  gamesLost: bigint;
  gamesPushed: bigint;
  playerBusts: bigint;
  winRate: number;
}

enum HandState {
  None = 0,
  PendingInitialDeal = 1,
  Active = 2,
  PendingHit = 3,
  PendingStand = 4,
  Busted = 5,
  Finished = 6,
}

/**
 * Direct RPC Client for Blackjack Contract
 */
export class BlackjackRPCClient {
  private walletProvider: CdpSmartWalletProvider;
  private contractAddress: string;
  private playerAddress: string;

  constructor(
    walletProvider: CdpSmartWalletProvider,
    contractAddress: string,
    playerAddress: string
  ) {
    this.walletProvider = walletProvider;
    this.contractAddress = contractAddress;
    this.playerAddress = playerAddress;
  }

  /**
   * Get full game status with all details
   */
  async getGameStatus(): Promise<GameDisplay> {
    try {
      const result = await this.walletProvider.readContract({
        address: this.contractAddress as `0x${string}`,
        abi: BlackjackAbi,
        functionName: "getGameDisplay",
        args: [this.playerAddress],
      });

      return result as unknown as GameDisplay;
    } catch (error) {
      console.error("❌ Failed to get game status:", error);
      throw error;
    }
  }

  /**
   * Get quick status (lightweight alternative)
   */
  async getQuickStatus(): Promise<QuickStatus> {
    try {
      const result = await this.walletProvider.readContract({
        address: this.contractAddress as `0x${string}`,
        abi: BlackjackAbi,
        functionName: "getQuickStatus",
        args: [this.playerAddress],
      });

      const [state, playerTotal, dealerTotal, canAct, tradingPeriodEnds] =
        result as [string, number, number, boolean, bigint];

      return {
        state,
        playerTotal,
        dealerTotal,
        canAct,
        tradingPeriodEnds,
      };
    } catch (error) {
      console.error("❌ Failed to get quick status:", error);
      throw error;
    }
  }

  /**
   * Get player statistics
   */
  async getPlayerStats(): Promise<PlayerStats> {
    try {
      const result = await this.walletProvider.readContract({
        address: this.contractAddress as `0x${string}`,
        abi: BlackjackAbi,
        functionName: "getStats",
        args: [this.playerAddress],
      });

      const [gamesPlayed, gamesWon, gamesLost, gamesPushed, playerBusts] = result as [
        bigint,
        bigint,
        bigint,
        bigint,
        bigint
      ];

      const winRate =
        gamesPlayed > 0n ? Number((gamesWon * 100n) / gamesPlayed) / 100 : 0;

      return {
        gamesPlayed,
        gamesWon,
        gamesLost,
        gamesPushed,
        playerBusts,
        winRate,
      };
    } catch (error) {
      console.error("❌ Failed to get player stats:", error);
      throw error;
    }
  }

  /**
   * Check claimable winnings for a specific game
   */
  async getClaimableAmount(gameId: bigint): Promise<bigint> {
    try {
      const result = await this.walletProvider.readContract({
        address: this.contractAddress as `0x${string}`,
        abi: BlackjackAbi,
        functionName: "getClaimableAmount",
        args: [gameId, this.playerAddress],
      });

      return result as bigint;
    } catch (error) {
      console.error("❌ Failed to check claimable amount:", error);
      throw error;
    }
  }

  /**
   * Claim winnings directly (no AI needed)
   */
  async claimWinnings(gameId: bigint): Promise<string> {
    try {
      console.log(`\n💰 Claiming winnings for game ${gameId}...`);

      // First check if there are winnings to claim
      const claimable = await this.getClaimableAmount(gameId);
      if (claimable === 0n) {
        throw new Error("No winnings to claim for this game");
      }

      console.log(`💵 Claimable amount: ${claimable} wei`);

      // Encode the claim transaction
      const data = encodeFunctionData({
        abi: BlackjackAbi,
        functionName: "claimWinnings",
        args: [gameId],
      });

      // Send the transaction
      const hash = await this.walletProvider.sendTransaction({
        to: this.contractAddress as `0x${string}`,
        data: data as `0x${string}`,
      });

      console.log(`✅ Claim transaction sent: ${hash}`);

      // Wait for confirmation
      const receipt = await this.walletProvider.waitForTransactionReceipt(hash as `0x${string}`);

      console.log(`✅ Claim confirmed in block ${receipt.blockNumber}`);
      console.log(`💰 Successfully claimed ${claimable} wei!`);

      return hash;
    } catch (error) {
      console.error("❌ Failed to claim winnings:", error);
      throw error;
    }
  }

  /**
   * Poll game state until VRF callback completes
   * Returns when the game exits the specified pending state
   */
  async pollForStateChange(
    initialState: HandState,
    maxWaitTime: number = 300000 // 5 minutes
  ): Promise<GameDisplay> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds
    let pollCount = 0;

    console.log(`\n🔄 Polling for state change from ${HandState[initialState]}...`);

    while (Date.now() - startTime < maxWaitTime) {
      pollCount++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Get current game state
      const gameDisplay = await this.getGameStatus();
      const currentStateStr = gameDisplay.status.toLowerCase();

      console.log(`[Poll #${pollCount} @ ${elapsed}s] Status: "${gameDisplay.status}"`);

      // Check if we're still in the pending state
      const stillPending =
        (initialState === HandState.PendingInitialDeal && currentStateStr.includes("dealing")) ||
        (initialState === HandState.PendingHit && currentStateStr.includes("drawing")) ||
        (initialState === HandState.PendingStand && currentStateStr.includes("dealer playing"));

      // If we've exited the pending state, return the new state
      if (!stillPending) {
        console.log(`✅ State changed! New status: "${gameDisplay.status}"`);
        return gameDisplay;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Timeout waiting for state change from ${HandState[initialState]}`);
  }

  /**
   * Poll until trading period ends (60 seconds after game start)
   */
  async waitForTradingPeriod(): Promise<void> {
    console.log("\n⏳ Waiting for trading period to end...");

    while (true) {
      const gameStatus = await this.getGameStatus();
      const secondsLeft = Number(gameStatus.secondsUntilCanAct);

      if (secondsLeft <= 0) {
        console.log("✅ Trading period ended, can now act!");
        return;
      }

      console.log(`⏳ ${secondsLeft}s remaining in trading period...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  /**
   * Check if game is in a state where we need to wait for VRF
   */
  isWaitingForVRF(status: string): boolean {
    const statusLower = status.toLowerCase();
    return (
      statusLower.includes("dealing") ||
      statusLower.includes("drawing") ||
      statusLower.includes("dealer playing")
    );
  }

  /**
   * Check if game is complete
   */
  isGameComplete(status: string): boolean {
    const statusLower = status.toLowerCase();
    return (
      statusLower.includes("you win") ||
      statusLower.includes("dealer wins") ||
      statusLower.includes("push") ||
      statusLower.includes("busted") ||
      statusLower.includes("finished") ||
      statusLower.includes("game over")
    );
  }

  /**
   * Get wallet ETH balance
   */
  async getBalance(): Promise<bigint> {
    try {
      const balance = await this.walletProvider.getBalance();
      return balance;
    } catch (error) {
      console.error("❌ Failed to get balance:", error);
      throw error;
    }
  }
}

// NOTE: createRPCClient() moved to rpc-client-factory.ts
// to avoid importing Node.js modules (fs) in Edge Runtime routes