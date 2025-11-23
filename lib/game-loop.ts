/**
 * Game Loop State Machine
 *
 * Manages autonomous blackjack gameplay with a state machine architecture.
 * Coordinates between direct RPC calls and AI decision-making.
 */

import type { BlackjackRPCClient } from "./rpc-client";
import { EventEmitter } from "events";

// Game states
export enum GameLoopState {
  IDLE = "IDLE",
  CHECKING_CLAIMABLE = "CHECKING_CLAIMABLE",
  CLAIMING_WINNINGS = "CLAIMING_WINNINGS",
  STARTING_GAME = "STARTING_GAME",
  WAITING_INITIAL_DEAL = "WAITING_INITIAL_DEAL",
  WAITING_TRADING_PERIOD = "WAITING_TRADING_PERIOD",
  PLAYING = "PLAYING",
  WAITING_HIT_VRF = "WAITING_HIT_VRF",
  WAITING_STAND_VRF = "WAITING_STAND_VRF",
  GAME_COMPLETE = "GAME_COMPLETE",
  ERROR = "ERROR",
}

// Game result types
export enum GameResult {
  WIN = "WIN",
  LOSS = "LOSS",
  PUSH = "PUSH",
  BUST = "BUST",
  UNKNOWN = "UNKNOWN",
}

// Statistics tracking
export interface GameStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  pushes: number;
  busts: number;
  winRate: number;
  currentStreak: number;
  longestWinStreak: number;
  longestLossStreak: number;
}

// Game loop event
export interface GameLoopEvent {
  type: string;
  state: GameLoopState;
  data?: any;
  timestamp: number;
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
 * Autonomous Blackjack Game Loop
 */
export class GameLoop extends EventEmitter {
  private rpcClient: BlackjackRPCClient;
  private state: GameLoopState = GameLoopState.IDLE;
  private currentGameId: bigint | null = null;
  private stats: GameStats;
  private lastGameResult: GameResult | null = null;
  private shouldStop: () => boolean;

  private constructor(
    rpcClient: BlackjackRPCClient, 
    shouldStop: () => boolean,
    initialStats?: Partial<GameStats>
  ) {
    super(); // Call EventEmitter constructor
    this.rpcClient = rpcClient;
    this.shouldStop = shouldStop;
    this.stats = {
      gamesPlayed: initialStats?.gamesPlayed || 0,
      wins: initialStats?.wins || 0,
      losses: initialStats?.losses || 0,
      pushes: initialStats?.pushes || 0,
      busts: initialStats?.busts || 0,
      winRate: initialStats?.winRate || 0,
      currentStreak: initialStats?.currentStreak || 0,
      longestWinStreak: initialStats?.longestWinStreak || 0,
      longestLossStreak: initialStats?.longestLossStreak || 0,
    };
  }

  /**
   * Create a new GameLoop instance with historical stats from contract
   */
  static async create(
    rpcClient: BlackjackRPCClient,
    shouldStop: () => boolean = () => false
  ): Promise<GameLoop> {
    try {
      console.log("📊 Loading historical stats from contract...");
      const contractStats = await rpcClient.getPlayerStats();

      console.log("✅ Historical stats loaded:", {
        gamesPlayed: contractStats.gamesPlayed.toString(),
        wins: contractStats.gamesWon.toString(),
        losses: contractStats.gamesLost.toString(),
        pushes: contractStats.gamesPushed.toString(),
        busts: contractStats.playerBusts.toString(),
        winRate: contractStats.winRate,
      });

      return new GameLoop(rpcClient, shouldStop, {
        gamesPlayed: Number(contractStats.gamesPlayed),
        wins: Number(contractStats.gamesWon),
        losses: Number(contractStats.gamesLost),
        pushes: Number(contractStats.gamesPushed),
        busts: Number(contractStats.playerBusts),
        winRate: contractStats.winRate,
        currentStreak: 0, // Not tracked by contract
        longestWinStreak: 0, // Not tracked by contract
        longestLossStreak: 0, // Not tracked by contract
      });
    } catch (error) {
      console.warn("⚠️ Failed to load historical stats, starting fresh:", error);
      return new GameLoop(rpcClient, shouldStop);
    }
  }

  /**
   * Transition to new state
   */
  private setState(newState: GameLoopState): void {
    const oldState = this.state;
    this.state = newState;
    console.log(`🔄 State: ${oldState} → ${newState}`);
    this.emit("state_change", { from: oldState, to: newState });
  }

  /**
   * Update state (alias for setState for backwards compatibility)
   */
  private updateState(newState: GameLoopState): void {
    this.setState(newState);
  }

  /**
   * Start a new game
   */
  private async startGame(): Promise<void> {
    this.setState(GameLoopState.STARTING_GAME);
    
    const betAmount = process.env.BET_AMOUNT || "700000000000000";
    console.log(`💰 Starting game with bet: ${betAmount} wei`);
    
    const startSuccess = await this.executeAction("start", betAmount);

    if (!startSuccess) {
      console.log("❌ Failed to start game - stopping autonomous play");
      this.setState(GameLoopState.ERROR);
      this.emit("error", { message: "Failed to start game. Check wallet balance and contract state." });
      throw new Error("Failed to start game");
    }

    // Wait for initial deal
    this.setState(GameLoopState.WAITING_INITIAL_DEAL);
    const afterDeal = await this.rpcClient.pollForStateChange(
      HandState.PendingInitialDeal,
      300000,
      this.shouldStop
    );
    this.currentGameId = afterDeal.gameId;
    
    this.emit("initial_deal", {
      playerCards: afterDeal.playerCards,
      playerTotal: afterDeal.playerTotal,
      dealerCards: afterDeal.dealerCards,
      dealerTotal: afterDeal.dealerTotal,
    });

    // Check if game ended immediately (blackjack)
    if (this.rpcClient.isGameComplete(afterDeal.status)) {
      this.setState(GameLoopState.GAME_COMPLETE);
      const result = this.parseGameResult(afterDeal.status);
      this.updateStats(result);
      this.emit("game_complete", {
        result,
        status: afterDeal.status,
        playerCards: afterDeal.playerCards,
        playerTotal: afterDeal.playerTotal,
        dealerCards: afterDeal.dealerCards,
        dealerTotal: afterDeal.dealerTotal,
      });

      // Claim winnings if we won
      if (result === GameResult.WIN && this.currentGameId) {
        await this.claimWinnings(this.currentGameId);
      }
      return;
    }

    // Wait for trading period to end
    this.setState(GameLoopState.WAITING_TRADING_PERIOD);
    await this.rpcClient.waitForTradingPeriod(this.shouldStop);
    
    // Now play the hand
    await this.playHand();
  }

  /**
   * Update statistics
   */
  private updateStats(result: GameResult): void {
    this.stats.gamesPlayed++;

    switch (result) {
      case GameResult.WIN:
        this.stats.wins++;
        break;
      case GameResult.LOSS:
        this.stats.losses++;
        break;
      case GameResult.BUST:
        this.stats.busts++;
        this.stats.losses++;
        break;
      case GameResult.PUSH:
        this.stats.pushes++;
        break;
    }

    this.stats.winRate = this.stats.gamesPlayed > 0 ? this.stats.wins / this.stats.gamesPlayed : 0;

    this.emit("stats_update", this.stats);
  }

  /**
   * Parse game result from status string
   */
  private parseGameResult(status: string): GameResult {
    const statusLower = status.toLowerCase();

    if (statusLower.includes("you win") || statusLower.includes("blackjack")) {
      return GameResult.WIN;
    } else if (statusLower.includes("dealer wins")) {
      return GameResult.LOSS;
    } else if (statusLower.includes("busted")) {
      return GameResult.BUST;
    } else if (statusLower.includes("push")) {
      return GameResult.PUSH;
    }

    return GameResult.UNKNOWN;
  }

  /**
   * Claim winnings for a game (extracted to avoid duplication)
   */
  private async claimWinnings(gameId: bigint): Promise<void> {
    try {
      this.setState(GameLoopState.CHECKING_CLAIMABLE);
      const claimable = await this.rpcClient.getClaimableAmount(gameId);

      if (claimable > 0n) {
        this.setState(GameLoopState.CLAIMING_WINNINGS);
        console.log(`💰 Attempting to claim ${claimable} wei from game ${gameId}`);
        await this.rpcClient.claimWinnings(gameId);
        this.emit("winnings_claimed", { gameId, amount: claimable });
        console.log(`✅ Successfully claimed ${claimable} wei`);
      } else {
        console.log(`ℹ️  No claimable winnings for game ${gameId}`);
      }
    } catch (error) {
      console.error("⚠️  Failed to claim winnings, will continue to next game:", error);
      // Don't throw - continue to next game even if claiming fails
    }
  }

  /**
   * Main game loop - runs one complete game cycle
   */
  async runGameCycle(): Promise<void> {
    this.updateState(GameLoopState.CHECKING_CLAIMABLE);

    // Check if we should stop at the very beginning
    if (this.shouldStop()) {
      console.log("🛑 [CYCLE] Game cycle stopped by user request (entry point)");
      throw new Error("Stopped by user");
    }

    console.log("🔍 Checking for existing active game...");
    
    // Get current game state
    const currentStatus = await this.rpcClient.getGameStatus();
    
    console.log("\n📊 === Current Game State ===");
    console.log(`Game ID: ${currentStatus.gameId}`);
    console.log(`Status: "${currentStatus.status}"`);
    console.log(`Can Start New: ${currentStatus.canStartNew}`);
    console.log(`Can Hit: ${currentStatus.canHit}`);
    console.log(`Can Stand: ${currentStatus.canStand}`);
    console.log(`Player Cards: ${currentStatus.playerCards.length}`);
    console.log(`Dealer Cards: ${currentStatus.dealerCards.length}`);
    console.log(`Started At: ${currentStatus.startedAt}`);
    console.log(`Last Action At: ${currentStatus.lastActionAt}`);
    console.log(`Trading Period Ends: ${currentStatus.tradingPeriodEnds}`);
    console.log("===============================\n");

    // Check if we need to claim winnings from completed game
    if (this.rpcClient.isGameComplete(currentStatus.status) && currentStatus.gameId > 0n) {
      console.log(`✅ Game #${currentStatus.gameId} is complete, checking for claimable winnings...`);
      
      try {
        const claimable = await this.rpcClient.getClaimableAmount(currentStatus.gameId);
        console.log(`💰 Claimable amount: ${claimable} wei`);
        
        if (claimable > 0n) {
          await this.claimWinnings(currentStatus.gameId);
        } else {
          console.log("ℹ️ No winnings to claim (already claimed or lost)");
        }
      } catch (error) {
        console.error("❌ Error checking/claiming winnings:", error);
      }
      
      // After claiming (or if nothing to claim), start new game
      console.log("\n🎲 Starting new game after previous completion...");
      await this.startGame();
    }
    // Check if there's an active game that needs to be played
    else if (!currentStatus.canStartNew && currentStatus.gameId > 0n) {
      console.log(`♠️ Resuming active game #${currentStatus.gameId}...`);
      
      // Check if we're waiting for VRF
      if (this.rpcClient.isWaitingForVRF(currentStatus.status)) {
        console.log("⏳ Game is waiting for VRF callback, will poll for completion...");
        // playHand will handle VRF polling
      }
      
      // Check if trading period is active
      if (currentStatus.secondsUntilCanAct > 0n) {
        console.log(`⏳ Trading period active, waiting ${currentStatus.secondsUntilCanAct}s...`);
        await this.rpcClient.waitForTradingPeriod(this.shouldStop);
      }
      
      // Play the active game
      await this.playHand();
    }
    // No active game - start fresh
    else if (currentStatus.canStartNew) {
      console.log("🎲 No active game, starting new one...");
      await this.startGame();
    }
    else {
      console.log("⚠️ Unknown game state - cannot proceed");
      console.log(`Status: ${currentStatus.status}`);
      console.log(`Can Start New: ${currentStatus.canStartNew}`);
      console.log(`Game ID: ${currentStatus.gameId}`);
      this.updateState(GameLoopState.ERROR);
      this.emit("error", { message: "Unknown game state", status: currentStatus.status });
    }
  }

  /**
   * Play the active hand (hit/stand decisions)
   * Note: AI decision logic must be injected from server-side code
   */
  private async playHand(): Promise<void> {
    this.setState(GameLoopState.PLAYING);

    while (true) {
      // Check if we should stop before each iteration
      if (this.shouldStop()) {
        console.log("🛑 [PLAYHAND] Play hand stopped by user request (loop start)");
        throw new Error("Stopped by user");
      }

      const gameStatus = await this.rpcClient.getGameStatus();

      console.log(`\n📊 GAME STATUS DEBUG:`);
      console.log(`   Status: "${gameStatus.status}"`);
      console.log(`   Player Total: ${gameStatus.playerTotal}`);
      console.log(`   Dealer Total: ${gameStatus.dealerTotal}`);
      console.log(`   Can Hit: ${gameStatus.canHit}`);
      console.log(`   Can Stand: ${gameStatus.canStand}`);
      console.log(`   Is Complete: ${this.rpcClient.isGameComplete(gameStatus.status)}`);
      console.log(`   Is Waiting VRF: ${this.rpcClient.isWaitingForVRF(gameStatus.status)}`);

      // Check if game is complete
      if (this.rpcClient.isGameComplete(gameStatus.status)) {
        console.log("✅ Game is complete, exiting play loop");
        break;
      }

      // Check if waiting for VRF
      if (this.rpcClient.isWaitingForVRF(gameStatus.status)) {
        console.log("⏳ Still waiting for VRF...");
        await this.sleep(2000);
        continue;
      }

      // Can't act yet
      if (!gameStatus.canHit && !gameStatus.canStand) {
        console.log("⏳ Cannot act yet (canHit=false, canStand=false)");
        await this.sleep(2000);
        continue;
      }

      // Check again before making decision (AI call can take time)
      if (this.shouldStop()) {
        console.log("🛑 [PLAYHAND] Play hand stopped before decision (pre-AI call)");
        throw new Error("Stopped by user");
      }

      // Make decision via API call (server-side AI)
      const decision = await this.getDecision(
        gameStatus.playerTotal,
        gameStatus.dealerTotal,
        gameStatus.playerCards,
        gameStatus.dealerCards
      );

      this.emit("decision", {
        action: decision,
        playerTotal: gameStatus.playerTotal,
        dealerTotal: gameStatus.dealerTotal,
      });

      // Check once more before executing action
      if (this.shouldStop()) {
        console.log("🛑 [PLAYHAND] Play hand stopped before action execution (pre-blockchain)");
        throw new Error("Stopped by user");
      }

      // Execute decision via API
      if (decision === "hit") {
        await this.executeAction("hit");
        this.setState(GameLoopState.WAITING_HIT_VRF);
        await this.rpcClient.pollForStateChange(HandState.PendingHit, 300000, this.shouldStop);
      } else {
        await this.executeAction("stand");
        this.setState(GameLoopState.WAITING_STAND_VRF);
        await this.rpcClient.pollForStateChange(HandState.PendingStand, 300000, this.shouldStop);
        break; // Stand ends the hand
      }

      this.setState(GameLoopState.PLAYING);
    }
  }

  /**
   * Get AI decision via API call
   */
  private async getDecision(
    playerTotal: number,
    dealerTotal: number,
    playerCards: any[],
    dealerCards: any[]
  ): Promise<"hit" | "stand"> {
    // Basic strategy fallback (hit on <17, stand on >=17)
    return playerTotal < 17 ? "hit" : "stand";
  }

  /**
   * Execute action via /api/agent endpoint
   */
  private async executeAction(action: "start" | "hit" | "stand", betAmount?: string): Promise<boolean> {
    try {
      let message = "";

      if (action === "start") {
        message = `Start a new blackjack game with a bet of ${betAmount} wei.`;
      } else if (action === "hit") {
        message = "Hit - draw another card.";
      } else if (action === "stand") {
        message = "Stand - end your turn and let dealer play.";
      }

      console.log(`\n🤖 Calling AI agent: ${message}`);

      // Check if we should stop before making the request
      if (this.shouldStop()) {
        console.log("🛑 [ACTION] Action cancelled before execution (pre-fetch)");
        throw new Error("Stopped by user");
      }

      // Create AbortController with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

      // Poll shouldStop during the request
      const stopCheckInterval = setInterval(() => {
        if (this.shouldStop()) {
          console.log("🛑 [ACTION] Aborting action request due to stop (during fetch)");
          controller.abort();
        }
      }, 500); // Check every 500ms

      try {
        // Use relative URL to work with any port
        const apiUrl = typeof window !== 'undefined'
          ? '/api/agent'
          : `http://localhost:${process.env.PORT || 3000}/api/agent`;

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userMessage: message }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        clearInterval(stopCheckInterval);

        if (!response.ok) {
          throw new Error(`Agent API failed: ${response.status}`);
        }

        const data = await response.json();
        const agentResponse = data.response || "";

        // Check if the response indicates an error
        const errorKeywords = ["error", "failed", "reverted", "insufficient", "check your balance", "try again later", "needs more eth", "needs eth"];
        const hasError = errorKeywords.some(keyword =>
          agentResponse.toLowerCase().includes(keyword)
        );

        if (hasError) {
          console.log(`❌ ${action.toUpperCase()} action failed`);
          console.log(`🤖 Agent response: ${agentResponse.substring(0, 200)}`);
          return false;
        }

        console.log(`✅ ${action.toUpperCase()} action executed`);
        console.log(`🤖 Agent response: ${agentResponse.substring(0, 200)}`);
        return true;
      } finally {
        clearTimeout(timeoutId);
        clearInterval(stopCheckInterval);
      }
    } catch (error) {
      // Check if this was an abort due to stop
      if (error instanceof Error && error.name === 'AbortError') {
        console.log("🛑 Action request aborted");
        throw new Error("Stopped by user");
      }
      console.error(`❌ Failed to execute ${action}:`, error);
      return false;
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current state
   */
  getState(): GameLoopState {
    return this.state;
  }

  /**
   * Get current game ID
   */
  getCurrentGameId(): bigint | null {
    return this.currentGameId;
  }

  /**
   * Get current statistics
   */
  getStats(): GameStats {
    return { ...this.stats };
  }

  /**
   * Get last game result
   */
  getLastResult(): GameResult | null {
    return this.lastGameResult;
  }
}