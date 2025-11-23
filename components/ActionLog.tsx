/**
 * Action Log Component
 *
 * Real-time log of game events and decisions.
 */

"use client";

import { GameLoopEvent } from "@/lib/game-loop";
import { useEffect, useRef } from "react";

interface ActionLogProps {
  events: GameLoopEvent[];
}

const EVENT_ICONS: Record<string, string> = {
  state_change: "🔄",
  initial_deal: "🎴",
  decision: "🤔",
  game_complete: "🏁",
  winnings_claimed: "💰",
  stats_update: "📊",
  error: "❌",
  connected: "📡",
  status_update: "ℹ️",
};

export function ActionLog({ events }: ActionLogProps) {
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const formatEventData = (event: GameLoopEvent) => {
    switch (event.type) {
      case "state_change":
        const stateMsg = event.data.message || `${event.data.from} → ${event.data.to}`;
        return stateMsg;

      case "initial_deal":
        return event.data.message || `Player: ${event.data.playerTotal}, Dealer: ${event.data.dealerTotal}`;

      case "decision":
        return event.data.message || `${event.data.action?.toUpperCase()} (Player: ${event.data.playerTotal}, Dealer: ${event.data.dealerTotal})`;

      case "game_complete":
        return event.data.message || `${event.data.result} - ${event.data.status}`;

      case "winnings_claimed":
        return event.data.message || `Game ${event.data.gameId}: ${event.data.amount} wei`;

      case "error":
        return event.data.error || event.data.message || "Unknown error";

      case "status_update":
        return event.data.message || "Status updated";

      default:
        return event.data.message || JSON.stringify(event.data || {});
    }
  };

  return (
    <div
      ref={logRef}
      className="bg-gray-900/50 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm space-y-2"
    >
      {events.length === 0 && (
        <div className="text-gray-500 text-center py-8">
          No events yet. Start autonomous play to see action log.
        </div>
      )}

      {events.map((event, index) => (
        <div key={index} className="flex items-start gap-2 text-gray-300 hover:bg-gray-800/50 p-2 rounded">
          <span className="text-lg">{EVENT_ICONS[event.type] || "•"}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-xs">{formatTimestamp(event.timestamp)}</span>
              <span className="font-semibold text-blue-400">{event.type}</span>
            </div>
            <div className="text-xs text-gray-400 mt-1 break-words">{formatEventData(event)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}