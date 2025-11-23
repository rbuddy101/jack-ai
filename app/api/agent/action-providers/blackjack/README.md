# Blackjack Action Provider

This action provider enables AI agents to play Blackjack on-chain using smart contracts on Base Sepolia and Base Mainnet.

## Overview

The Blackjack action provider implements 6 actions that allow an AI agent to:
- Start new games with ETH bets
- Play hands by hitting or standing
- Check game status and statistics
- Handle VRF (Verifiable Random Function) callbacks for card dealing

## Actions

### 1. `blackjack_start_game`

Start a new Blackjack game with a bet amount.

**Parameters:**
- `feeAmount` (string): Amount of ETH to bet in wei (e.g., "1000000000000000" for 0.001 ETH)

**Behavior:**
1. Sends transaction to start game with ETH value
2. Waits for transaction confirmation
3. Polls contract every 2 seconds for VRF callback to complete (up to 5 minutes)
4. Returns dealt cards and game state once initial deal is complete

**Example Usage:**
```
AI: "Start a blackjack game with 0.001 ETH bet"
→ Calls blackjack_start_game({ feeAmount: "1000000000000000" })
→ Returns: "✅ Game started successfully! Game #42 Status: Active..."
```

### 2. `blackjack_hit`

Draw another card in the current game.

**Parameters:** None (uses connected wallet address)

**Behavior:**
1. Sends transaction to hit
2. Waits for transaction confirmation
3. Polls for VRF callback to reveal the new card
4. Returns updated hand and game state

**Example Usage:**
```
AI: "Hit me"
→ Calls blackjack_hit()
→ Returns: "✅ Hit action completed! Player Hand: K♠ 7♥ 5♠ (Total: 22) - BUSTED!"
```

### 3. `blackjack_stand`

End your turn and let the dealer play.

**Parameters:** None (uses connected wallet address)

**Behavior:**
1. Sends transaction to stand
2. Waits for transaction confirmation
3. Polls for VRF callback to deal dealer cards and determine winner
4. Returns final game result

**Example Usage:**
```
AI: "I'll stand"
→ Calls blackjack_stand()
→ Returns: "✅ Stand action completed! Game #42 Status: Finished..."
```

### 4. `blackjack_get_game_status`

Get full game status including all cards, totals, and available actions.

**Parameters:**
- `playerAddress` (string, optional): Address to check (defaults to connected wallet)

**Returns:** Complete game state with:
- Player and dealer hands with card symbols (♠ ♥ ♦ ♣)
- Hand totals
- Available actions (canHit, canStand, canStartNew)
- Trading period information
- Game timing details

**Example Usage:**
```
AI: "What's my current game status?"
→ Calls blackjack_get_game_status()
→ Returns detailed game state
```

### 5. `blackjack_get_quick_status`

Get lightweight status check (state, totals, can act).

**Parameters:**
- `playerAddress` (string, optional): Address to check (defaults to connected wallet)

**Returns:** Quick summary with:
- Game status string
- Player and dealer totals
- Whether you can act
- Trading period info

**Example Usage:**
```
AI: "Quick status check"
→ Calls blackjack_get_quick_status()
→ Returns: "Game #42 Quick Status: Active, Player Total: 17..."
```

### 6. `blackjack_get_player_stats`

Get player statistics across all games.

**Parameters:**
- `playerAddress` (string, optional): Address to check (defaults to connected wallet)

**Returns:**
- Games played
- Wins, losses, pushes (ties)
- Busts
- Win rate percentage

**Example Usage:**
```
AI: "Show me my blackjack stats"
→ Calls blackjack_get_player_stats()
→ Returns: "📊 Player Statistics: Games Played: 15, Wins: 7, Losses: 6..."
```

## VRF Polling Behavior

The contract uses Chainlink VRF (Verifiable Random Function) for provably fair card dealing. This means:

1. **Transaction Confirmation:** When you call `startGame()`, `hit()`, or `stand()`, the transaction is confirmed immediately
2. **Pending State:** The game enters a pending state (PendingInitialDeal, PendingHit, or PendingStand)
3. **VRF Callback:** The contract waits for Chainlink VRF to provide random numbers
4. **State Update:** Once VRF responds, the contract deals cards and updates game state
5. **Polling:** The action provider automatically polls every 2 seconds to detect state changes
6. **Timeout:** Maximum wait time is 5 minutes (matches contract VRF timeout)

**If VRF times out:**
- The action will throw an error: "VRF timeout: Game state did not update within 5 minutes"
- You may need to call `cancelStuckGame()` on the contract (admin function)

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Required for Base Sepolia
BLACKJACK_CONTRACT_ADDRESS_SEPOLIA=0x74c48b987B6644218Ba92974E95B446f9C1FF30A

# Required for Base Mainnet (when available)
BLACKJACK_CONTRACT_ADDRESS_MAINNET=
```

### Network Support

- ✅ Base Sepolia (chainId: 84532)
- ✅ Base Mainnet (chainId: 8453)

The action provider will automatically detect the network from your WalletProvider and use the appropriate contract address.

## Integration

The action provider is automatically included when you initialize AgentKit:

```typescript
// In prepare-agentkit.ts
import { blackjackActionProvider } from "./action-providers/blackjack";

const agentkit = await AgentKit.from({
  walletProvider,
  actionProviders: [
    // ... other providers
    blackjackActionProvider(),
  ],
});
```

## Game Flow Example

Here's a typical game flow:

```
User: "Play blackjack with 0.001 ETH"
AI: Calls blackjack_start_game({ feeAmount: "1000000000000000" })
    ⏳ Waiting for VRF... (2-30 seconds typically)
    ✅ Returns: "Game started! Player: K♠ 7♥ (17), Dealer: A♦ (showing)"

User: "Hit me"
AI: Calls blackjack_hit()
    ⏳ Waiting for VRF...
    ✅ Returns: "Drew 3♦ - Player total: 20"

User: "I'll stand"
AI: Calls blackjack_stand()
    ⏳ Waiting for VRF...
    ✅ Returns: "Dealer draws: 10♥ 5♦ - Final: Player 20, Dealer 16 - You win!"
```

## Error Handling

All actions return user-friendly error messages:

```
❌ Error starting game: BLACKJACK_CONTRACT_ADDRESS_SEPOLIA not set in environment
❌ Error hitting: Unsupported network chainId: 1. Only Base Sepolia and Base Mainnet are supported.
❌ Error standing: VRF timeout: Game state did not update within 5 minutes.
```

## Trading Period

The Blackjack contract includes a prediction market where other users can bet on your game outcome during a "trading period" (typically 60 seconds after game starts). During this time:

- You can see "Trading Period: Active (45s remaining)" in game status
- You must wait for trading to end before hitting or standing
- The `canHit` and `canStand` flags will be `false` until trading ends
- The `secondsUntilCanAct` field shows how long you must wait

## Notes

- **Gas Costs:** Each action requires a transaction (start game requires ETH for bet + gas)
- **VRF Delays:** Expect 2-30 second delays for VRF callbacks under normal conditions
- **Network Requirements:** Only works on Base Sepolia and Base Mainnet
- **Wallet Management:** Uses the wallet configured in your WalletProvider
- **Contract ABI:** Uses `Blackjackabi.json` in project root

## Contract Functions Used

The action provider calls these contract functions:

- `startGame()` - Payable, starts new game with ETH bet
- `hit()` - Request another card
- `stand()` - End player turn, dealer plays
- `getGameDisplay(address)` - Get full game state with cards
- `getQuickStatus(address)` - Get lightweight status
- `getStats(address)` - Get player lifetime statistics

## Development

To modify or extend the action provider:

1. **Add new actions:** Use `@CreateAction` decorator in `blackjackActionProvider.ts`
2. **Update schemas:** Add Zod validation schemas in `schemas.ts`
3. **Test:** Ensure contract address is configured and wallet has Base Sepolia ETH
4. **Export:** Update `index.ts` to export new actions

## Troubleshooting

**"VRF timeout" errors:**
- Check if Chainlink VRF is working on the network
- Verify contract has LINK tokens for VRF fees
- May need admin to call `cancelStuckGame()`

**"Unsupported network" errors:**
- Ensure `NETWORK_ID` in `.env` is set to `base-sepolia` or `base-mainnet`
- Verify contract addresses are configured for the network

**"Contract address not set" errors:**
- Add `BLACKJACK_CONTRACT_ADDRESS_SEPOLIA` or `BLACKJACK_CONTRACT_ADDRESS_MAINNET` to `.env`

**Transaction failures:**
- Ensure wallet has sufficient ETH for bet + gas
- Check if you have an active game already (only one game per address at a time)
- Verify you're not trying to act during the trading period
