# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An autonomous AI blackjack player powered by Coinbase AgentKit on Base blockchain. Built with Next.js 15.5, the system features:
- **Hybrid Architecture**: Direct RPC calls for efficiency + AI agent for strategic gameplay decisions
- **Real-time Dashboard**: Server-Sent Events (SSE) streaming with live card display
- **Autonomous Play**: Single-game execution mode with automatic claiming of winnings
- **State Machine**: 11-state game loop managing VRF callbacks and trading periods

## Development Commands

```bash
# Install dependencies
npm install

# Configure environment (copy .env template and add keys)
mv .env.local .env

# Start development server (http://localhost:3000)
npm run dev

# Production build and start
npm run build
npm start

# Linting
npm run lint
```

## Environment Configuration

### Required Variables
- **OPENAI_API_KEY** - From https://platform.openai.com/api-keys
- **CDP_API_KEY_ID** / **CDP_API_KEY_SECRET** - From https://portal.cdp.coinbase.com/
- **CDP_WALLET_SECRET** - Private key for wallet (auto-generated if not provided)
- **AI_WALLET** - Wallet address (matches CDP_WALLET_SECRET)
- **BLACKJACK_CONTRACT_ADDRESS** - Blackjack smart contract address

### Optional Variables
- **NETWORK_ID** - `base-mainnet` or `base-sepolia` (default: `base-sepolia`)
- **RPC_URL** - Custom RPC endpoint
- **BET_AMOUNT** - Bet size in wei (default: `700000000000000`)
- **NEXT_PUBLIC_BET_AMOUNT** - Display value in ETH (default: `0.0007`)

## Architecture

### Hybrid AI + RPC System

The application uses a **dual-path architecture**:

1. **Direct RPC Path** (`lib/rpc-client.ts`)
   - Efficient contract reads: `getGameStatus()`, `getClaimableAmount()`, `getPlayerStats()`
   - Direct claiming: `claimWinnings()` bypasses AI for speed
   - VRF polling: `pollForStateChange()`, `waitForTradingPeriod()`
   - Helper methods: `isGameComplete()`, `isWaitingForVRF()`

2. **AI Agent Path** (`app/api/agent/`)
   - Strategic decisions: AI chooses hit/stand based on game state
   - Game actions: Uses blackjack action provider for `startGame()`, `hit()`, `stand()`
   - Conversation context: Multi-turn chat with blockchain execution

### Autonomous Play System

Three-layer architecture for autonomous gameplay:

#### Layer 1: Game Loop State Machine (`lib/game-loop.ts`)

11-state machine managing complete game cycles:
```
IDLE → CHECKING_CLAIMABLE → CLAIMING_WINNINGS → STARTING_GAME →
WAITING_INITIAL_DEAL → WAITING_TRADING_PERIOD → PLAYING →
WAITING_HIT_VRF/WAITING_STAND_VRF → GAME_COMPLETE → ERROR
```

**Key Methods**:
- `runGameCycle()` - Executes one complete game:
  1. Check contract for existing game state
  2. Branch: Resume active game | Claim complete game + start new | Start fresh game
  3. Play hand with AI decisions
  4. Claim winnings if won
  5. Stop (single-game mode)

- `playHand()` - Core gameplay loop:
  - Check game completion and VRF status
  - Call AI for hit/stand decision
  - Execute action via `/api/agent`
  - Poll for VRF callback completion

- `claimWinnings(gameId)` - Extracted helper to avoid duplication
- Event emission for SSE streaming

#### Layer 2: Autonomous Player Manager (`lib/autonomous-player.ts`)

Singleton managing autonomous play lifecycle:
- **Initialization**: Creates RPC client and game loop
- **Single-Game Execution**: `runContinuousLoop()` runs ONE game then stops
- **Event Forwarding**: Broadcasts game events to SSE listeners
- **Status Management**: Provides `getStatus()` for dashboard

**State Management**:
- `isRunning` - Tracks active play session
- `currentError` - Captures error state
- `eventListeners` - Array of SSE subscribers

#### Layer 3: Dashboard Integration

**Frontend** (`components/GameDashboard.tsx`, `components/CardDisplay.tsx`):
- Real-time card display during gameplay
- State machine visualization
- Statistics tracking (wins, losses, pushes, busts, streaks)
- Action log with event history

**SSE Stream** (`app/api/autonomous/stream/route.ts`):
- Server-Sent Events for real-time updates
- Event types: `connected`, `status_update`, `initial_deal`, `decision`, `game_complete`, `error`
- 5-second status polling + event-driven updates
- BigInt serialization for JSON compatibility

**Hook** (`app/hooks/useAutonomousPlayer.ts`):
- Manages SSE connection and auto-reconnect
- Tracks `currentCards` state from `initial_deal` events
- Provides `startPlay()` / `stopPlay()` controls
- Clears cards on `game_complete` event

### AI Agent System

#### Agent Configuration

**`app/api/agent/prepare-agentkit.ts`**:
- Initializes `CdpSmartWalletProvider` with CDP credentials
- Configures action providers:
  - `blackjackActionProvider()` - Custom on-chain blackjack actions
  - `wethActionProvider()`, `pythActionProvider()`, `erc20ActionProvider()`
  - `walletActionProvider()`, `cdpApiActionProvider()`, `cdpSmartWalletActionProvider()`
- Persists wallet to `wallet_data.txt` (contains `ownerAddress`, `smartWalletAddress`)
- Returns `agentkit` and `walletProvider` instances

**`app/api/agent/create-agent.ts`**:
- Configures OpenAI `gpt-4o-mini` model
- Sets system prompt with blackjack strategy and faucet instructions
- Converts AgentKit actions to Vercel AI SDK tools
- Returns singleton agent instance

#### Blackjack Action Provider (`app/api/agent/action-providers/blackjack/`)

Custom AgentKit actions for on-chain blackjack:

**Game Actions**:
1. `blackjack_start_game({ feeAmount })` - Start game with ETH bet, poll for initial deal VRF
2. `blackjack_hit()` - Draw card, poll for hit VRF callback
3. `blackjack_stand()` - End turn, poll for dealer play VRF callback
4. `blackjack_claim_winnings({ gameId })` - Claim winnings from completed game

**Status Actions**:
5. `blackjack_get_game_status()` - Full game state with cards, totals, available actions
6. `blackjack_get_quick_status()` - Lightweight status check
7. `blackjack_get_player_stats()` - Lifetime statistics (games, wins, losses, win rate)

**VRF Polling**: All game actions poll contract every 2 seconds (max 5 minutes) for Chainlink VRF callbacks to complete. VRF provides provably fair randomness for card dealing.

**Trading Period**: 60-second period after game start where prediction market users can bet on outcome. Player must wait for trading to end before hitting/standing.

#### API Routes

**`app/api/agent/route.ts`**:
- POST `/api/agent` - Accepts `{ userMessage: string }`
- Maintains server-side `messages` array for conversation history
- Uses Vercel AI SDK `generateText()` with AgentKit tools
- Returns `{ response: string }` or `{ error: string }`

**`app/api/autonomous/route.ts`**:
- GET - Returns current autonomous player status
- POST - Accepts `{ action: "start" | "stop" }` to control autonomous play

### State Management & Events

**Server-Side State**:
- Conversation history in `app/api/agent/route.ts` (persists during server runtime)
- Autonomous player state in `lib/autonomous-player.ts` singleton
- Game loop state in `lib/game-loop.ts` (per-game instance)

**Client-Side State** (`app/hooks/useAutonomousPlayer.ts`):
- SSE connection and event stream
- Current cards display (`playerCards`, `dealerCards`, totals)
- Dashboard status and statistics
- Resets on page refresh, reconnects to SSE automatically

**Event Flow**:
```
GameLoop.emit() → AutonomousPlayer.eventListeners →
SSE route controller.enqueue() → EventSource.onmessage →
useAutonomousPlayer state updates → Dashboard re-render
```

### Smart Contract Integration

**Contract** (`Blackjackabi.json`):
- Deployed on Base Mainnet: `BLACKJACK_CONTRACT_ADDRESS` from `.env`
- Key functions: `startGame()`, `hit()`, `stand()`, `claimWinnings()`, `getGameDisplay()`, `getQuickStatus()`, `getStats()`
- Uses Chainlink VRF for provably fair card dealing
- Includes prediction market trading period mechanism
- Single game per address constraint

**VRF Flow**:
1. Player action (start/hit/stand) → Transaction confirmed → State: PendingInitialDeal/PendingHit/PendingStand
2. Contract requests Chainlink VRF random numbers
3. VRF callback updates contract state with dealt cards
4. Application polls contract every 2s to detect state change
5. Returns updated game state to user

### Dashboard Components

**`components/GameDashboard.tsx`**:
- Control panel with Start/Stop buttons
- Card display (shows/hides based on active game)
- State machine visualization
- Statistics panel
- Action log with event history

**`components/CardDisplay.tsx`**:
- Dealer hand with cards and total
- Player (AI Agent) hand with cards and total
- Card rendering with suit symbols (♠ ♥ ♦ ♣) and colors
- Auto-updates from SSE `initial_deal` events

**`components/StateMachine.tsx`**:
- Visual state machine with current state highlighted
- All 11 states displayed with descriptions

**`components/GameStats.tsx`**:
- Games played, win rate
- Wins, losses, pushes, busts
- Current streak, best win streak, worst loss streak

**`components/ActionLog.tsx`**:
- Chronological event list with timestamps
- Event types: state_change, decision, initial_deal, game_complete, stats_update, error

## Key Workflows

### Starting Autonomous Play

1. User clicks "Start Autonomous Play" button
2. POST `/api/autonomous` with `{ action: "start" }`
3. `autonomousPlayer.start()` initializes RPC client and game loop
4. `runContinuousLoop()` executes single game:
   - Checks for existing game via RPC
   - Resumes/claims/starts as appropriate
   - Plays hand with AI decisions
   - Claims winnings if won
   - **Stops after one game** (user must click start again)
5. Events stream to dashboard via SSE

### AI Decision Making

**Option 1: Autonomous Mode** (`lib/autonomous-player.ts`):
- Game loop calls `executeAction("hit")` or `executeAction("stand")`
- Posts to `/api/agent` with natural language message
- AI agent executes blackjack action via action provider
- Returns to game loop after VRF completion

**Option 2: Manual Chat** (`app/page.tsx`):
- User types message in chat interface
- `useAgent.sendMessage()` posts to `/api/agent`
- AI processes message and executes actions
- Response displayed in chat with markdown

### Game State Detection

**Smart Resumption Logic** (`lib/game-loop.ts:207-324`):
```typescript
const currentStatus = await rpcClient.getGameStatus();

if (rpcClient.isGameComplete(currentStatus.status)) {
  // Claim winnings from completed game, then start new
} else if (currentStatus.canStartNew) {
  // No active game - start fresh
} else {
  // Active game exists - resume it
  // Handle trading period if still active
}
```

### Claiming Winnings

**Automatic Claiming**:
1. Game completes with win result
2. `claimWinnings(currentGameId)` called automatically
3. Checks `getClaimableAmount()` via RPC
4. Direct RPC `claimWinnings()` transaction (bypasses AI for speed)
5. Emits `winnings_claimed` event with amount
6. Continues to next game

**Error Handling**: If claiming fails, logs error but continues (doesn't block next game)

## TypeScript Configuration

- Strict mode enabled
- Path alias: `@/*` maps to project root
- ES2022 target with ESNext modules
- Next.js and React types included

## Development Notes

- **Port 3000**: Dev server must run on localhost:3000
- **Hot Reload**: Works automatically, but changes to agent config may require restart
- **Wallet Persistence**: `wallet_data.txt` prevents wallet recreation across sessions
- **Message State**: Server-side message history resets on dev server restart
- **BigInt Serialization**: SSE stream converts BigInt to string/number for JSON
- **Single Game Mode**: Autonomous player runs ONE game per "Start" click, then stops
- **Card Display**: Shows during active game, clears on completion
- **Trading Period**: Must wait ~60 seconds after game start before first action
- **VRF Delays**: Expect 2-30 second delays for card dealing under normal network conditions
