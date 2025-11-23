# Blackjack AI Agent - Feature Documentation

## Overview

The AI agent has been transformed into a dedicated Blackjack assistant that focuses exclusively on helping users play on-chain Blackjack. The agent now includes AI-powered strategy recommendations based on the current game state.

## Key Changes

### 1. **Agent Configuration (Blackjack-Only Actions)**

**File: `app/api/agent/prepare-agentkit.ts`**

- ✅ Removed all non-Blackjack action providers (WETH, Pyth, ERC20, CDP API, Wallet, Smart Wallet, X402)
- ✅ Agent now only has access to Blackjack-related actions
- ✅ Simplified imports and configuration

**Available Blackjack Actions:**
- `blackjack_start_game` - Start a new game with ETH bet
- `blackjack_hit` - Draw another card
- `blackjack_stand` - End turn and let dealer play
- `blackjack_get_game_status` - Get full game state
- `blackjack_get_quick_status` - Get lightweight status
- `blackjack_get_player_stats` - View lifetime statistics
- `blackjack_claim_winnings` - Claim unclaimed winnings
- `blackjack_check_claimable` - Check for claimable winnings

### 2. **Enhanced System Prompt**

**File: `app/api/agent/create-agent.ts`**

The agent now has a comprehensive Blackjack-focused system prompt that includes:

- **Clear Purpose**: Agent only plays Blackjack, nothing else
- **Game Rules**: Standard Blackjack rules and constraints
- **Workflow Guidance**: Mandatory workflow for checking/claiming winnings before starting new games
- **Game State Awareness**: Knows what actions are allowed in each game state
- **User Experience**: Friendly, encouraging, and informative responses
- **VRF Education**: Explains Chainlink VRF waits to users

### 3. **AI Strategy Recommendation System**

**File: `app/api/strategy/route.ts`**

New API endpoint that provides intelligent strategy recommendations:

**Features:**
- Analyzes current hand and dealer up card
- Applies basic blackjack strategy:
  - Stand on 17+
  - Hit on 11 or less
  - Consider dealer card for 12-16 range
- Handles game state validation (trading period, pending states)
- Returns structured output with action, reasoning, and confidence level
- Uses GPT-4o-mini with low temperature for consistent strategy

**Request Format:**
```typescript
{
  playerTotal: number;
  playerCards: Array<{ rank: string; suit: string }>;
  dealerUpCard: { rank: string; suit: string } | null;
  gameState: string;
  canHit: boolean;
  canStand: boolean;
  tradingPeriodActive: boolean;
}
```

**Response Format:**
```typescript
{
  action: "hit" | "stand" | "wait" | "none";
  reasoning: string;
  confidence: number; // 0-100
}
```

### 4. **Enhanced Homepage UI**

**File: `app/page.tsx`**

Major UI improvements with strategy integration:

**New Features:**
- 🎰 **Header with Branding**: "Blackjack AI Assistant" title
- 🧠 **AI Strategy Button**: Get recommendations for current hand
- 💡 **Strategy Result Display**:
  - Shows recommended action (HIT/STAND/WAIT)
  - Displays AI reasoning
  - Shows confidence percentage
  - One-click execute buttons for recommended actions
- 🎮 **Quick Action Buttons**:
  - New Game
  - Check Status
  - View Stats
- ✨ **Welcome Message**: Helpful onboarding for new users
- 🎨 **Visual Enhancements**: Color-coded actions, improved spacing

**Strategy Workflow:**
1. User clicks "Get AI Strategy" button
2. Agent fetches current game status
3. Game state is sent to strategy API
4. AI analyzes hand and returns recommendation
5. User sees action, reasoning, and confidence
6. User can execute recommendation with one click

## Usage Examples

### Starting a Game
```
User: "Start a game with 0.001 ETH"
Agent: ✅ Checks for unclaimed winnings → Claims if needed → Starts game → Shows initial cards
```

### Getting Strategy Recommendation
```
1. Click "🧠 Get AI Strategy" button
2. Agent fetches current game state
3. Strategy appears:
   Action: HIT (Confidence: 85%)
   Reasoning: "You have 15 and dealer shows 10. Hitting gives you better odds..."
4. Click "✅ Execute: HIT" to follow recommendation
```

### Game State Awareness
```
User: "Hit me"
Agent (if trading period active): "The trading period is still active (30s remaining).
      You can act once it ends. Want me to check again in a moment?"

Agent (if game finished): "This game is already finished. You won 0.002 ETH!
      Want to claim your winnings and start a new game?"
```

## Technical Implementation Notes

### Current Limitations

**Strategy Implementation (Important):**
The current implementation uses **mock game state data** for the strategy recommendation. This is because:
1. The agent returns unstructured text responses
2. Parsing game state from chat messages is unreliable
3. Need structured data for accurate strategy

**Production Enhancement Needed:**
To make strategy fully functional, you should:

1. **Add a dedicated game status endpoint:**
```typescript
// app/api/game-status/route.ts
export async function POST(request: NextRequest) {
  // Call blackjack contract directly
  // Return structured game state
  return NextResponse.json({
    playerTotal: 15,
    playerCards: [...],
    dealerUpCard: {...},
    gameState: "Active",
    canHit: true,
    canStand: true,
    tradingPeriodActive: false,
  });
}
```

2. **Update strategy function to use real data:**
```typescript
const getStrategy = async () => {
  // Fetch structured game state from dedicated endpoint
  const gameState = await fetch("/api/game-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerAddress: walletAddress }),
  }).then(r => r.json());

  // Send to strategy API
  const strategy = await fetch("/api/strategy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(gameState),
  }).then(r => r.json());

  setStrategyResult(strategy);
};
```

### Game State Machine

The Blackjack contract uses these states:
- `None` - No active game
- `PendingInitialDeal` - Waiting for VRF to deal initial cards
- `Active` - Player can hit or stand (after trading period)
- `PendingHit` - Waiting for VRF to deal hit card
- `PendingStand` - Waiting for VRF to deal dealer cards
- `Busted` - Player exceeded 21
- `Finished` - Game complete, winner determined

The agent understands these states and guides users appropriately.

### VRF Polling

All game actions use Chainlink VRF for provably fair randomness:
- Transactions confirm immediately
- VRF callback takes 2-30 seconds typically
- Agent automatically polls and waits for state changes
- Maximum wait time: 5 minutes (matches contract timeout)

## Testing Checklist

- [ ] Agent only suggests Blackjack actions (rejects non-Blackjack requests)
- [ ] Agent checks for unclaimed winnings before starting new games
- [ ] Agent explains VRF waits to users
- [ ] Agent respects game state constraints (trading period, pending states)
- [ ] Strategy button triggers game status check
- [ ] Strategy API returns valid recommendations
- [ ] Execute buttons correctly call hit/stand
- [ ] Quick action buttons work (New Game, Status, Stats)
- [ ] UI displays strategy results clearly
- [ ] Dark mode works properly

## Future Enhancements

1. **Real Game State Integration**
   - Add dedicated contract reading endpoint
   - Parse real-time game state
   - Update strategy to use actual hand data

2. **Advanced Strategy**
   - Add card counting hints
   - Consider soft hands (Ace as 11)
   - Factor in player's risk tolerance
   - Show probability calculations

3. **Game Analytics**
   - Track win/loss streaks
   - Show historical performance
   - Compare to optimal strategy
   - Display bankroll management tips

4. **Multiplayer Features**
   - Show other active games
   - Spectate other players
   - Social leaderboards
   - Achievement system

## Environment Variables

Make sure these are set in `.env`:

```bash
# Required
OPENAI_API_KEY=sk-...
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
BLACKJACK_CONTRACT_ADDRESS=0x...

# Optional
NETWORK_ID=base-mainnet
PAYMASTER_URL=...
```

## Support

For issues or questions:
- Check `app/api/agent/action-providers/blackjack/README.md` for action provider details
- See contract ABI in `Blackjackabi.json`
- Review system prompt in `app/api/agent/create-agent.ts`

---

**Note**: The strategy system currently uses mock data. For production use, implement the dedicated game status endpoint as described in the Technical Implementation Notes section.
