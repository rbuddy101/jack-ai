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
  error: string | null;
  startPlay: () => Promise<void>;
  stopPlay: () => Promise<void>;
}

export function useAutonomousPlayer(): UseAutonomousPlayerResult {
  const [status, setStatus] = useState<AutonomousPlayerStatus | null>(null);
  const [events, setEvents] = useState<GameLoopEvent[]>([]);
  const [currentCards, setCurrentCards] = useState<CurrentCards | null>(null);
  const [lastGameResult, setLastGameResult] = useState<LastGameResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

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
          currentState: "IDLE" as GameLoopState,
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
    } catch (error) {
      console.error("Failed to fetch status:", error);
      setError(error instanceof Error ? error.message : "Unknown error");
    }
  }, []);

  /**
   * Start autonomous play
   */
  const startPlay = useCallback(async () => {
    setIsLoading(true);
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
      setIsLoading(false);
    }
  }, [fetchStatus]);

  /**
   * Stop autonomous play
   */
  const stopPlay = useCallback(async () => {
    setIsLoading(true);
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
      setIsLoading(false);
    }
  }, [fetchStatus]);

  /**
   * Initialize on mount
   */
  useEffect(() => {
    // Fetch stats immediately from blockchain
    fetchStats();
    // Connect to SSE stream for real-time updates (will send status)
    connectToStream();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [fetchStats, connectToStream]);

  return {
    status,
    events,
    currentCards,
    lastGameResult,
    isLoading,
    error,
    startPlay,
    stopPlay,
  };
}
