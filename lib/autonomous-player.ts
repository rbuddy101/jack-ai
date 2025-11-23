/**
 * Autonomous Player Manager
 *
 * Singleton class that manages continuous autonomous blackjack gameplay.
 * Coordinates game loop, RPC client, and event streaming.
 */

import { createRPCClient } from "./rpc-client-factory";
import type { BlackjackRPCClient } from "./rpc-client";
import { GameLoop, GameLoopState } from "./game-loop";
import type { GameLoopEvent, GameStats } from "./game-loop";

export interface AutonomousPlayerStatus {
  isRunning: boolean;
  currentState: GameLoopState;
  stats: GameStats;
  currentGameId: bigint | null;
  error: string | null;
}

/**
 * Singleton Autonomous Player
 */
class AutonomousPlayerInstance {
  private rpcClient: BlackjackRPCClient | null = null;
  private gameLoop: GameLoop | null = null;
  private isRunning = false;
  private currentError: string | null = null;
  private eventListeners: Array<(event: GameLoopEvent) => void> = [];

  /**
   * Initialize the player
   */
  private async initialize(): Promise<void> {
    if (this.rpcClient && this.gameLoop) {
      return; // Already initialized
    }

    console.log("🎰 Initializing Autonomous Blackjack Player...");

    try {
      // Create RPC client
      this.rpcClient = await createRPCClient();
      console.log("✅ RPC Client initialized");

      // Create game loop with historical stats from contract
      this.gameLoop = await GameLoop.create(this.rpcClient);
      console.log("✅ Game Loop initialized");

      // Forward events to listeners
      // EventEmitter emits events with (eventName, ...args) signature
      const forwardEvent = (eventType: string, data?: any) => {
        const event: GameLoopEvent = {
          type: eventType,
          state: this.gameLoop?.getState() || GameLoopState.IDLE,
          data,
          timestamp: Date.now(),
        };
        
        this.eventListeners.forEach((listener) => {
          try {
            listener(event);
          } catch (error) {
            console.error("Event listener error:", error);
          }
        });
      };

      // Listen to all game loop events
      this.gameLoop.on("state_change", (data) => forwardEvent("state_change", data));
      this.gameLoop.on("initial_deal", (data) => forwardEvent("initial_deal", data));
      this.gameLoop.on("decision", (data) => forwardEvent("decision", data));
      this.gameLoop.on("game_complete", (data) => forwardEvent("game_complete", data));
      this.gameLoop.on("winnings_claimed", (data) => forwardEvent("winnings_claimed", data));
      this.gameLoop.on("stats_update", (data) => forwardEvent("stats_update", data));
      this.gameLoop.on("error", (data) => forwardEvent("error", data));

      console.log("✅ Autonomous Player ready!");
    } catch (error) {
      console.error("❌ Failed to initialize autonomous player:", error);
      throw error;
    }
  }

  /**
   * Start autonomous play
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("⚠️  Already running");
      return;
    }

    await this.initialize();

    this.isRunning = true;
    this.currentError = null;
    console.log("🎮 Starting autonomous play...");

    // Run game loop continuously
    this.runContinuousLoop();
  }

  /**
   * Stop autonomous play
   */
  stop(): void {
    if (!this.isRunning) {
      console.log("⚠️  Not running");
      return;
    }

    this.isRunning = false;
    console.log("🛑 Stopping autonomous play...");
  }

  /**
   * Single game loop - runs one game then stops
   */
  private async runContinuousLoop(): Promise<void> {
    try {
      console.log("\n" + "=".repeat(60));
      console.log("🎲 STARTING SINGLE GAME");
      console.log("=".repeat(60) + "\n");

      // Run one game cycle
      await this.gameLoop!.runGameCycle();

      // Stop after one game
      this.isRunning = false;
      console.log("✅ Game completed - stopped autonomous play");
    } catch (error) {
      console.error("❌ Error in game loop:", error);
      this.currentError = error instanceof Error ? error.message : String(error);

      // Emit error event
      this.eventListeners.forEach((listener) => {
        listener({
          type: "error",
          state: this.gameLoop?.getState() || GameLoopState.ERROR,
          data: { error: this.currentError },
          timestamp: Date.now(),
        });
      });

      // Stop on error
      this.isRunning = false;
      console.log("🛑 Stopped due to error");
    }

    console.log("✅ Autonomous play stopped");
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<AutonomousPlayerStatus> {
    if (!this.gameLoop || !this.rpcClient) {
      return {
        isRunning: false,
        currentState: GameLoopState.IDLE,
        stats: {
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          pushes: 0,
          busts: 0,
          winRate: 0,
          currentStreak: 0,
          longestWinStreak: 0,
          longestLossStreak: 0,
        },
        currentGameId: null,
        error: this.currentError,
      };
    }

    return {
      isRunning: this.isRunning,
      currentState: this.gameLoop.getState(),
      stats: this.gameLoop.getStats(),
      currentGameId: this.gameLoop.getCurrentGameId(),
      error: this.currentError,
    };
  }

  /**
   * Subscribe to events
   */
  on(listener: (event: GameLoopEvent) => void): void {
    this.eventListeners.push(listener);
  }

  /**
   * Unsubscribe from events
   */
  off(listener: (event: GameLoopEvent) => void): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Check if running
   */
  isPlaying(): boolean {
    return this.isRunning;
  }

  /**
   * Get current game state
   */
  getCurrentState(): GameLoopState {
    return this.gameLoop?.getState() || GameLoopState.IDLE;
  }

  /**
   * Get statistics
   */
  getStats(): GameStats {
    return (
      this.gameLoop?.getStats() || {
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        busts: 0,
        winRate: 0,
        currentStreak: 0,
        longestWinStreak: 0,
        longestLossStreak: 0,
      }
    );
  }
}

// Singleton instance
const autonomousPlayer = new AutonomousPlayerInstance();

export default autonomousPlayer;

// Export for type checking
export type { AutonomousPlayerInstance };