/**
 * Game Dashboard Component
 *
 * Main autonomous blackjack player dashboard with controls and statistics.
 */

"use client";

import { useAutonomousPlayer } from "@/app/hooks/useAutonomousPlayer";
import { StateMachine } from "./StateMachine";
import { GameStats as StatsDisplay } from "./GameStats";
import { ActionLog } from "./ActionLog";
import { CardDisplay } from "./CardDisplay";

export function GameDashboard() {
  const { status, events, currentCards, lastGameResult, isStarting, isStopping, isSelling, error, walletInfo, startPlay, stopPlay, startSimulatedPlay, sellWass } = useAutonomousPlayer();

  const betAmount = process.env.NEXT_PUBLIC_BET_AMOUNT || "0.0007";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-8">

        {/* Simulated Play Button - Top Left */}
        <div className="mb-4">
          <button
            onClick={startSimulatedPlay}
            disabled={status?.isRunning}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors shadow-lg"
          >
            ▶ Quick Play
          </button>
          <p className="text-gray-400 text-xs mt-1">
            Fast simulated game for testing
          </p>
        </div>

        {/* Controls */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold mb-2">Controls</h2>
              <p className="text-gray-400 text-sm">
                Bet Amount: {betAmount} ETH per game
              </p>
              {walletInfo && (
                <>
                  <p className="text-gray-400 text-sm mt-1">
                    AI Wallet: <span className="font-mono text-xs">{walletInfo.address}</span>
                  </p>
                  <p className={`text-sm mt-1 font-semibold ${walletInfo.balance >= 0.0007 ? 'text-green-400' : 'text-yellow-400'}`}>
                    ETH Balance: {walletInfo.balance.toFixed(6)} ETH
                    {walletInfo.balance < 0.0007 && ' ⚠️ Low Balance'}
                  </p>
                  <p className="text-sm mt-1 font-semibold text-purple-400">
                    wASS Balance: {walletInfo.wAssBalance.toFixed(2)} wASS
                  </p>
                </>
              )}
              {status?.isRunning && (
                <p className="text-green-400 text-sm mt-1">● Running</p>
              )}
              {!status?.isRunning && status !== null && (
                <p className="text-gray-500 text-sm mt-1">○ Stopped</p>
              )}
            </div>

            <div className="flex gap-4">
              <button
                onClick={startPlay}
                disabled={isStarting || isStopping || status?.isRunning}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
              >
                {isStarting ? "Starting..." : "▶ Start Autonomous Play"}
              </button>

              <button
                onClick={stopPlay}
                disabled={isStopping}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
              >
                {isStopping ? "Stopping..." : "■ Stop Play"}
              </button>

              <button
                onClick={async () => {
                  try {
                    await sellWass();
                    alert('wASS sold successfully!');
                  } catch (err) {
                    alert(`Failed to sell wASS: ${err instanceof Error ? err.message : 'Unknown error'}`);
                  }
                }}
                disabled={isSelling || !walletInfo || walletInfo.wAssBalance <= 0}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
              >
                {isSelling ? "Selling..." : "💰 Sell wASS"}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200">
              ❌ Error: {error}
            </div>
          )}

          {status?.error && (
            <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200">
              ❌ Game Error: {status.error}
            </div>
          )}
        </div>

        {/* Cards Display - Current Game or Last Result */}
        {currentCards && (
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Current Game</h2>
            <CardDisplay
              playerCards={currentCards.playerCards}
              playerTotal={currentCards.playerTotal}
              dealerCards={currentCards.dealerCards}
              dealerTotal={currentCards.dealerTotal}
            />
          </div>
        )}

        {/* Last Game Result - Show when no current game */}
        {!currentCards && lastGameResult && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-2xl font-semibold">Last Game</h2>
              <span
                className={`px-4 py-1 rounded-full text-lg font-bold ${
                  lastGameResult.result === "WIN"
                    ? "bg-green-600 text-white"
                    : lastGameResult.result === "LOSS"
                    ? "bg-red-600 text-white"
                    : lastGameResult.result === "PUSH"
                    ? "bg-yellow-600 text-white"
                    : "bg-gray-600 text-white"
                }`}
              >
                {lastGameResult.result}
              </span>
            </div>
            <CardDisplay
              playerCards={lastGameResult.playerCards}
              playerTotal={lastGameResult.playerTotal}
              dealerCards={lastGameResult.dealerCards}
              dealerTotal={lastGameResult.dealerTotal}
            />
          </div>
        )}

        {/* Main Content Grid - Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Left Column - State and Stats */}
          <div className="lg:col-span-2 space-y-8">
            {/* State Machine */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h2 className="text-xl font-semibold mb-4">Current State</h2>
              <StateMachine currentState={status?.currentState || "IDLE"} />
              {status?.currentGameId && (
                <div className="mt-4 text-sm text-gray-400">
                  Game ID: {status.currentGameId.toString()}
                </div>
              )}
            </div>

            {/* Statistics */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h2 className="text-xl font-semibold mb-4">Statistics</h2>
              {status && <StatsDisplay stats={status.stats} />}
            </div>
          </div>

          {/* Right Column - Action Log */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Action Log</h2>
            <ActionLog events={events} />
          </div>
        </div>
    </div>
  );
}