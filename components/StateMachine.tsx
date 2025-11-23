/**
 * State Machine Visualization
 *
 * Visual representation of the current game loop state.
 */

"use client";

import { GameLoopState } from "@/lib/game-loop";

interface StateMachineProps {
  currentState: string;
}

const STATE_COLORS: Record<GameLoopState, string> = {
  [GameLoopState.IDLE]: "bg-gray-600",
  [GameLoopState.CHECKING_CLAIMABLE]: "bg-blue-600",
  [GameLoopState.CLAIMING_WINNINGS]: "bg-green-600",
  [GameLoopState.STARTING_GAME]: "bg-yellow-600",
  [GameLoopState.WAITING_INITIAL_DEAL]: "bg-purple-600",
  [GameLoopState.WAITING_TRADING_PERIOD]: "bg-orange-600",
  [GameLoopState.PLAYING]: "bg-green-500 animate-pulse",
  [GameLoopState.WAITING_HIT_VRF]: "bg-purple-600 animate-pulse",
  [GameLoopState.WAITING_STAND_VRF]: "bg-purple-600 animate-pulse",
  [GameLoopState.GAME_COMPLETE]: "bg-blue-500",
  [GameLoopState.ERROR]: "bg-red-600",
};

const STATE_DESCRIPTIONS: Record<GameLoopState, string> = {
  [GameLoopState.IDLE]: "Idle - Ready to start",
  [GameLoopState.CHECKING_CLAIMABLE]: "Checking for claimable winnings",
  [GameLoopState.CLAIMING_WINNINGS]: "Claiming winnings from previous game",
  [GameLoopState.STARTING_GAME]: "Starting new game",
  [GameLoopState.WAITING_INITIAL_DEAL]: "Waiting for initial cards (VRF)",
  [GameLoopState.WAITING_TRADING_PERIOD]: "Waiting for 60s trading period to end",
  [GameLoopState.PLAYING]: "Making decisions (Hit/Stand)",
  [GameLoopState.WAITING_HIT_VRF]: "Waiting for hit card (VRF)",
  [GameLoopState.WAITING_STAND_VRF]: "Waiting for dealer play (VRF)",
  [GameLoopState.GAME_COMPLETE]: "Game complete",
  [GameLoopState.ERROR]: "Error occurred",
};

export function StateMachine({ currentState }: StateMachineProps) {
  const state = currentState as GameLoopState;
  const colorClass = STATE_COLORS[state] || "bg-gray-600";
  const description = STATE_DESCRIPTIONS[state] || currentState;

  return (
    <div className="space-y-4">
      {/* Current State Display */}
      <div className="flex items-center gap-4">
        <div className={`w-4 h-4 rounded-full ${colorClass}`} />
        <div>
          <div className="font-semibold text-lg">{state}</div>
          <div className="text-sm text-gray-400">{description}</div>
        </div>
      </div>

      {/* State Flow Visualization */}
      <div className="grid grid-cols-2 gap-2 mt-6">
        {Object.values(GameLoopState).map((stateValue) => (
          <div
            key={stateValue}
            className={`p-2 rounded text-xs text-center transition-all ${
              state === stateValue
                ? `${STATE_COLORS[stateValue]} font-semibold scale-105`
                : "bg-gray-700 text-gray-400"
            }`}
          >
            {stateValue}
          </div>
        ))}
      </div>
    </div>
  );
}
