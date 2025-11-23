/**
 * useAutonomousPlayer Hook
 *
 * React hook for controlling and monitoring autonomous blackjack play.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { GameLoopState, GameLoopEvent, GameStats } from "@/lib/game-loop";

interface CardData {
  rank: string;
  suit: string;
  value: number;
}

interface CurrentCards {
  playerCards: CardData[];
  playerTotal: number;
  dealerCards: CardData[];
  dealerTotal: number;
}

interface AutonomousPlayerStatus {
  isRunning: boolean;
  currentState: GameLoopState;
  stats: GameStats;
  currentGameId: bigint | null;
  error: string | null;
}

interface LastGameResult {
  result: string;
  status: string;
  playerCards: CardData[];
  playerTotal: number;
  dealerCards: CardData[];
  dealerTotal: number;
}

interface UseAutonomousPlayerResult {
  status: AutonomousPlayerStatus | null;
  events: GameLoopEvent[];
  currentCards: CurrentCards | null;
  lastGameResult: LastGameResult | null;
  isLoading: boolean;
  isStarting: boolean;
  isStopping: boolean;
  isSelling: boolean;
  error: string | null;
  walletInfo: { address: string; balance: number; wAssBalance: number } | null;
  startPlay: () => Promise<void>;
  stopPlay: () => Promise<void>;
  startSimulatedPlay: () => void;
  sellWass: () => Promise<void>;
}

export function useAutonomousPlayer(): UseAutonomousPlayerResult {
  const [status, setStatus] = useState<AutonomousPlayerStatus | null>(null);
  const [events, setEvents] = useState<GameLoopEvent[]>([]);
  const [currentCards, setCurrentCards] = useState<CurrentCards | null>(null);
  const [lastGameResult, setLastGameResult] = useState<LastGameResult | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletInfo, setWalletInfo] = useState<{ address: string; balance: number; wAssBalance: number } | null>(null);
  const [isSelling, setIsSelling] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const simulationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Generate random card
   */
  const generateRandomCard = (): CardData => {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suits = ['♠', '♥', '♦', '♣'];
    const rank = ranks[Math.floor(Math.random() * ranks.length)];
    const suit = suits[Math.floor(Math.random() * suits.length)];
    
    let value: number;
    if (rank === 'A') value = 11;
    else if (['J', 'Q', 'K'].includes(rank)) value = 10;
    else value = parseInt(rank);

    return { rank, suit, value };
  };

  /**
   * Calculate hand total
   */
  const calculateTotal = (cards: CardData[]): number => {
    let total = cards.reduce((sum, card) => sum + card.value, 0);
    let aces = cards.filter(card => card.rank === 'A').length;
    
    // Adjust for aces
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    
    return total;
  };

  /**
   * Start simulated autonomous play
   */
  const startSimulatedPlay = useCallback(() => {
    console.log("🎮 Starting simulated play...");
    
    // Clear any existing simulation
    if (simulationTimeoutRef.current) {
      clearTimeout(simulationTimeoutRef.current);
    }

    // Initial state
    setStatus({
      isRunning: true,
      currentState: GameLoopState.CHECKING_CLAIMABLE,
      stats: status?.stats || {
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
      currentGameId: BigInt(Date.now()),
      error: null,
    });

    setEvents([{
      type: "state_change",
      state: GameLoopState.CHECKING_CLAIMABLE,
      timestamp: Date.now(),
      data: { message: "Checking for claimable winnings..." }
    }]);

    let timeElapsed = 0;

    // Step 1: Starting game (3s)
    setTimeout(() => {
      setStatus(prev => prev ? { ...prev, currentState: GameLoopState.STARTING_GAME } : prev);
      setEvents(prev => [...prev, {
        type: "state_change",
        state: GameLoopState.STARTING_GAME,
        timestamp: Date.now(),
        data: { from: GameLoopState.CHECKING_CLAIMABLE, to: GameLoopState.STARTING_GAME, message: "Starting new game..." }
      }]);
    }, 3000);
    timeElapsed += 3000;

    // Step 2: Waiting for initial deal (8s)
    setTimeout(() => {
      setStatus(prev => prev ? { ...prev, currentState: GameLoopState.WAITING_INITIAL_DEAL } : prev);
      setEvents(prev => [...prev, {
        type: "state_change",
        state: GameLoopState.WAITING_INITIAL_DEAL,
        timestamp: Date.now(),
        data: { from: GameLoopState.STARTING_GAME, to: GameLoopState.WAITING_INITIAL_DEAL, message: "Waiting for VRF callback for initial deal..." }
      }]);
    }, timeElapsed);
    timeElapsed += 8000;

    // Step 3: Initial deal received (11s)
    setTimeout(() => {
      const playerCards = [generateRandomCard(), generateRandomCard()];
      const dealerCards = [generateRandomCard(), generateRandomCard()];
      const playerTotal = calculateTotal(playerCards);
      const dealerTotal = calculateTotal(dealerCards);

      setCurrentCards({
        playerCards,
        playerTotal,
        dealerCards,
        dealerTotal,
      });

      setStatus(prev => prev ? { ...prev, currentState: GameLoopState.WAITING_TRADING_PERIOD } : prev);

      setEvents(prev => [...prev, {
        type: "initial_deal",
        state: GameLoopState.WAITING_TRADING_PERIOD,
        timestamp: Date.now(),
        data: {
          playerCards,
          playerTotal,
          dealerCards,
          dealerTotal,
          message: `Initial deal complete! Player: ${playerTotal}, Dealer: ${dealerTotal}`
        }
      }]);
    }, timeElapsed);
    timeElapsed += 11000;

    // Step 4: Playing - AI Decision
    setTimeout(() => {
      setStatus(prev => prev ? { ...prev, currentState: GameLoopState.PLAYING } : prev);
      setEvents(prev => [...prev, {
      type: "state_change",
      state: GameLoopState.PLAYING, // TEMP - will be replaced
      timestamp: Date.now(),
        data: { from: GameLoopState.WAITING_TRADING_PERIOD, to: GameLoopState.PLAYING, message: "Trading period ended. Making decision..." }
      }]);
    }, timeElapsed);
    timeElapsed += 2000;

    // Step 5: First decision
    setTimeout(() => {
      const currentPlayerTotal = currentCards?.playerTotal || 0;
      const currentDealerVisible = currentCards?.dealerCards[0]?.value || 0;
      const shouldHit = currentPlayerTotal < 17;

      setEvents(prev => [...prev, {
      type: "decision",
      state: GameLoopState.PLAYING, // TEMP - will be replaced
      timestamp: Date.now(),
        data: {
          action: shouldHit ? "hit" : "stand",
          playerTotal: currentPlayerTotal,
          dealerTotal: currentDealerVisible,
          message: `AI decided to ${shouldHit ? "HIT" : "STAND"}`
        }
      }]);
    }, timeElapsed);
    timeElapsed += 2000;

    // Step 6: Execute action (hit or stand)
    setTimeout(() => {
      const shouldHit = currentCards && currentCards.playerTotal < 17;
      const newState = shouldHit ? GameLoopState.WAITING_HIT_VRF : GameLoopState.WAITING_STAND_VRF;

      setStatus(prev => prev ? {
        ...prev,
        currentState: newState
      } : prev);

      setEvents(prev => [...prev, {
      type: "state_change",
      state: newState,
      timestamp: Date.now(),
        data: {
          from: GameLoopState.PLAYING,
          to: newState,
          message: `Waiting for VRF callback for ${shouldHit ? "hit" : "stand"}...`
        }
      }]);
    }, timeElapsed);
    timeElapsed += 2000;

    // Step 7: VRF completes - if hit, show new card
    setTimeout(() => {
      const wasHit = currentCards && currentCards.playerTotal < 17;

      if (wasHit && currentCards) {
        const newCard = generateRandomCard();
        const updatedPlayerCards = [...currentCards.playerCards, newCard];
        const updatedPlayerTotal = calculateTotal(updatedPlayerCards);

        setCurrentCards({
          ...currentCards,
          playerCards: updatedPlayerCards,
          playerTotal: updatedPlayerTotal,
        });

        setEvents(prev => [...prev, {
      type: "decision",
      state: GameLoopState.PLAYING, // TEMP - will be replaced
      timestamp: Date.now(),
          data: {
            action: "card_drawn",
            playerTotal: updatedPlayerTotal,
            dealerTotal: currentCards.dealerCards[0]?.value || 0,
            message: `Player drew ${newCard.rank}${newCard.suit}. New total: ${updatedPlayerTotal}`
          }
        }]);

        // After drawing, make another decision
        setTimeout(() => {
          const shouldHitAgain = updatedPlayerTotal < 17 && updatedPlayerTotal <= 21;

          setStatus(prev => prev ? { ...prev, currentState: GameLoopState.PLAYING } : prev);

          setEvents(prev => [...prev, {
      type: "decision",
      state: GameLoopState.PLAYING, // TEMP - will be replaced
      timestamp: Date.now(),
            data: {
              action: shouldHitAgain ? "hit" : "stand",
              playerTotal: updatedPlayerTotal,
              dealerTotal: currentCards.dealerCards[0]?.value || 0,
              message: `AI decided to ${shouldHitAgain ? "HIT again" : "STAND"}`
            }
          }]);

          // Final stand state
          setTimeout(() => {
            setStatus(prev => prev ? { ...prev, currentState: GameLoopState.WAITING_STAND_VRF } : prev);
            setEvents(prev => [...prev, {
      type: "state_change",
      state: GameLoopState.WAITING_STAND_VRF,
      timestamp: Date.now(),
              data: {
                from: GameLoopState.PLAYING,
                to: GameLoopState.WAITING_STAND_VRF,
                message: "Waiting for VRF callback for stand..."
              }
            }]);
          }, 2000);
        }, 3000);
      }
    }, timeElapsed);

    // Adjust for second decision if we hit
    const shouldHit = currentCards && currentCards.playerTotal < 17;
    timeElapsed += shouldHit ? 8000 : 5000; // More time if we hit
    if (shouldHit) {
      timeElapsed += 5000; // Additional time for second decision
    }

    // Step 8: Game Complete
    setTimeout(() => {
      // Use a callback to get the latest cards from state
      setCurrentCards(cards => {
        if (!cards) return cards;

        const playerTotal = cards.playerTotal;
        const dealerTotal = cards.dealerTotal;

        let result: string;
        let gameStatus: string;

        if (playerTotal > 21) {
          result = "LOSS";
          gameStatus = "Player busted";
        } else if (dealerTotal > 21) {
          result = "WIN";
          gameStatus = "Dealer busted";
        } else if (playerTotal > dealerTotal) {
          result = "WIN";
          gameStatus = "Player wins";
        } else if (dealerTotal > playerTotal) {
          result = "LOSS";
          gameStatus = "Dealer wins";
        } else {
          result = "PUSH";
          gameStatus = "Push";
        }

        // Update stats
        setStatus(prev => {
          if (!prev) return prev;

          const newStats = { ...prev.stats };
          newStats.gamesPlayed++;

          if (result === "WIN") {
            newStats.wins++;
            newStats.currentStreak = Math.max(0, newStats.currentStreak) + 1;
            newStats.longestWinStreak = Math.max(newStats.longestWinStreak, newStats.currentStreak);
          } else if (result === "LOSS") {
            newStats.losses++;
            if (playerTotal > 21) newStats.busts++;
            newStats.currentStreak = Math.min(0, newStats.currentStreak) - 1;
            newStats.longestLossStreak = Math.min(newStats.longestLossStreak, newStats.currentStreak);
          } else {
            newStats.pushes++;
            newStats.currentStreak = 0;
          }

          // Calculate win rate
          newStats.winRate = newStats.gamesPlayed > 0 ? newStats.wins / newStats.gamesPlayed : 0;

          return {
            ...prev,
            currentState: GameLoopState.GAME_COMPLETE,
            stats: newStats,
          };
        });

        // Save last game result
        setLastGameResult({
          result,
          status: gameStatus,
          playerCards: cards.playerCards,
          playerTotal,
          dealerCards: cards.dealerCards,
          dealerTotal,
        });

        // Add completion event
        setEvents(prev => [...prev, {
      type: "game_complete",
      state: GameLoopState.GAME_COMPLETE,
      timestamp: Date.now(),
          data: {
            result,
            status: gameStatus,
            playerCards: cards.playerCards,
            playerTotal,
            dealerCards: cards.dealerCards,
            dealerTotal,
            message: `Game complete: ${gameStatus}!`
          }
        }]);

        // Clear current cards
        return null;
      });
    }, timeElapsed);
    timeElapsed += 5000; // 5 seconds to complete

    // Step 7: Return to idle
    simulationTimeoutRef.current = setTimeout(() => {
      setStatus(prev => prev ? { ...prev, currentState: GameLoopState.IDLE, isRunning: false } : prev);
      setEvents(prev => [...prev, {
      type: "state_change",
      state: GameLoopState.IDLE,
      timestamp: Date.now(),
        data: { message: "Simulation complete!" }
      }]);

      console.log("✅ Simulated play complete");
    }, timeElapsed);
  }, [status, currentCards]);

  /**
   * Connect to SSE stream for real-time updates
   */
  const connectToStream = useCallback(() => {
    if (eventSourceRef.current) {
      return; // Already connected
    }

    console.log("📡 Connecting to event stream...");

    const eventSource = new EventSource("/api/autonomous/stream");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "status_update") {
          setStatus(data.data);
        } else if (data.type === "connected") {
          console.log("✅ Connected to event stream");
        } else if (data.type === "initial_deal") {
          // Update current cards when initial deal happens
          setCurrentCards({
            playerCards: data.data.playerCards || [],
            playerTotal: data.data.playerTotal || 0,
            dealerCards: data.data.dealerCards || [],
            dealerTotal: data.data.dealerTotal || 0,
          });
          setEvents((prev) => [...prev.slice(-50), data]);
        } else if (data.type === "game_complete") {
          // Store last game result with final cards, then clear current cards
          setLastGameResult({
            result: data.data.result,
            status: data.data.status,
            playerCards: data.data.playerCards || [],
            playerTotal: data.data.playerTotal || 0,
            dealerCards: data.data.dealerCards || [],
            dealerTotal: data.data.dealerTotal || 0,
          });
          setCurrentCards(null);
          setEvents((prev) => [...prev.slice(-50), data]);
        } else {
          // Other game events
          setEvents((prev) => [...prev.slice(-50), data]); // Keep last 50 events
        }
      } catch (error) {
        console.error("Failed to parse event:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE error:", error);
      eventSource.close();
      eventSourceRef.current = null;

      // Reconnect after 5 seconds
      setTimeout(connectToStream, 5000);
    };

    eventSourceRef.current = eventSource;
  }, []);

  /**
   * Fetch stats directly from blockchain
   */
  const fetchStats = useCallback(async () => {
    try {
      console.log("📊 Fetching stats from blockchain...");
      const response = await fetch("/api/stats");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.success) {
        console.log("✅ Stats loaded:", data.stats);
        // Update status with stats
        setStatus(prev => prev ? { ...prev, stats: data.stats } : {
          isRunning: false,
          currentState: GameLoopState.IDLE,
          stats: data.stats,
          currentGameId: null,
          error: null,
        });
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
      setError(error instanceof Error ? error.message : "Unknown error");
    }
  }, []);

  /**
   * Fetch current status
   */
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/autonomous");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setStatus(data);
      
      // Reset loading states when we get fresh status
      setIsStarting(false);
      setIsStopping(false);
      
      return data;
    } catch (error) {
      console.error("Failed to fetch status:", error);
      setError(error instanceof Error ? error.message : "Unknown error");
      
      // Reset loading states on error too
      setIsStarting(false);
      setIsStopping(false);
      
      return null;
    }
  }, []);

  /**
   * Fetch wallet info
   */
  const fetchWalletInfo = useCallback(async () => {
    try {
      const response = await fetch("/api/wallet");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.success) {
        setWalletInfo({
          address: data.address,
          balance: data.balance,
          wAssBalance: data.wAssBalance || 0,
        });
      }
    } catch (error) {
      console.error("Failed to fetch wallet info:", error);
    }
  }, []);

  /**
   * Sell all wASS tokens
   */
  const sellWass = useCallback(async () => {
    setIsSelling(true);
    setError(null);

    try {
      const response = await fetch("/api/sell-wass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("✅ wASS sold successfully:", data);

      // Refresh wallet info to show updated balances
      await fetchWalletInfo();

      return data;
    } catch (error) {
      console.error("Failed to sell wASS:", error);
      setError(error instanceof Error ? error.message : "Unknown error");
      throw error;
    } finally {
      setIsSelling(false);
    }
  }, [fetchWalletInfo]);

  /**
   * Start autonomous play
   */
  const startPlay = useCallback(async () => {
    setIsStarting(true);
    setError(null);

    try {
      const response = await fetch("/api/autonomous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      console.log("✅ Autonomous play started");
      await fetchStatus();
    } catch (error) {
      console.error("Failed to start:", error);
      setError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsStarting(false);
    }
  }, [fetchStatus]);

  /**
   * Stop autonomous play
   */
  const stopPlay = useCallback(async () => {
    setIsStopping(true);
    setError(null);

    try {
      const response = await fetch("/api/autonomous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      console.log("✅ Autonomous play stopped");
      await fetchStatus();
    } catch (error) {
      console.error("Failed to stop:", error);
      setError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsStopping(false);
    }
  }, [fetchStatus]);

  /**
   * Initialize on mount
   */
  useEffect(() => {
    // Reset all loading states on mount
    setIsStarting(false);
    setIsStopping(false);
    setIsSelling(false);
    
    // Check for existing running process on page load
    fetchStatus().then((currentStatus) => {
      if (currentStatus?.isRunning) {
        console.log("♻️ Reconnecting to running autonomous play...");
      } else {
        console.log("✅ No autonomous play currently running");
      }
    });

    // Fetch stats immediately from blockchain
    fetchStats();
    // Fetch wallet info
    fetchWalletInfo();
    // Connect to SSE stream for real-time updates (will send status)
    connectToStream();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [fetchStats, fetchWalletInfo, connectToStream, fetchStatus]);

  return {
    status,
    events,
    currentCards,
    lastGameResult,
    isLoading: isStarting || isStopping || isSelling,
    isStarting,
    isStopping,
    isSelling,
    error,
    walletInfo,
    startPlay,
    stopPlay,
    startSimulatedPlay,
    sellWass,
  };
}