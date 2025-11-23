/**
 * Game Statistics Display
 *
 * Shows win/loss statistics and streaks.
 */

"use client";

import { GameStats as GameStatsType } from "@/lib/game-loop";

interface GameStatsProps {
  stats: GameStatsType;
}

export function GameStats({ stats }: GameStatsProps) {
  const winRatePercent = (stats.winRate * 100).toFixed(1);

  return (
    <div className="space-y-4">
      {/* Main Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900/50 rounded-lg p-4">
          <div className="text-3xl font-bold text-blue-400">{stats.gamesPlayed}</div>
          <div className="text-sm text-gray-400">Games Played (Lifetime)</div>
        </div>

        <div className="bg-gray-900/50 rounded-lg p-4">
          <div className="text-3xl font-bold text-green-400">{winRatePercent}%</div>
          <div className="text-sm text-gray-400">Win Rate (Lifetime)</div>
        </div>
      </div>

      {/* Win/Loss Breakdown */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-green-900/30 rounded p-3 text-center">
          <div className="text-2xl font-bold text-green-400">{stats.wins}</div>
          <div className="text-xs text-gray-400">Wins</div>
        </div>

        <div className="bg-red-900/30 rounded p-3 text-center">
          <div className="text-2xl font-bold text-red-400">{stats.losses}</div>
          <div className="text-xs text-gray-400">Losses</div>
        </div>

        <div className="bg-yellow-900/30 rounded p-3 text-center">
          <div className="text-2xl font-bold text-yellow-400">{stats.pushes}</div>
          <div className="text-xs text-gray-400">Pushes</div>
        </div>

        <div className="bg-orange-900/30 rounded p-3 text-center">
          <div className="text-2xl font-bold text-orange-400">{stats.busts}</div>
          <div className="text-xs text-gray-400">Busts</div>
        </div>
      </div>
    </div>
  );
}
