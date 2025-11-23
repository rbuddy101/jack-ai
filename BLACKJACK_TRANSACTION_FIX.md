# Blackjack Transaction Issue Fix

## Problem Description

When calling `hit()` or `stand()` in the blackjack game, the transactions were **appearing successful** on Basescan but **not actually executing** the contract functions.

### What Was Happening

Looking at the Basescan transaction you shared:
```
Transaction Action: Execute Batch
Function by: 0xf0810F32...11Ba6Bb7A (Smart Wallet)
Status: Success ✅
Data: 0xd1dd546a (hit() function selector)
```

The issue was:
1. **Outer transaction succeeded** - The Smart Wallet's `executeBatch` function executed successfully
2. **Inner call silently reverted** - The actual `hit()` call to the Blackjack contract failed
3. **No events emitted** - No `PlayerHit`, `PlayerStood`, or VRF events were logged
4. **Game state unchanged** - The game remained in the same state after the transaction

### Root Cause

The code was using `walletProvider.sendTransaction()` with raw function selectors:

```typescript
// ❌ OLD CODE (Silent Reverts)
const hash = await walletProvider.sendTransaction({
  to: contractAddress as `0x${string}`,
  data: "0xd1dd546a" as `0x${string}`, // hit() function selector
});
```

**Why this failed:**
- CDP Smart Wallets wrap all transactions in `executeBatch()`
- Inner contract calls can revert without failing the outer transaction
- No error is thrown even though the actual game function didn't execute
- This is particularly problematic when:
  - VRF coordinator rejects the randomness request
  - VRF subscription is out of funds
  - Contract state checks fail (canHit/canStand = false)
  - Reentrancy guards trigger

## Solution

Use `viem`'s `encodeFunctionData()` to properly encode contract calls before sending:

```typescript
// ✅ NEW CODE (Proper ABI Encoding)
import { encodeFunctionData } from "viem";

const data = encodeFunctionData({
  abi: BlackjackAbi,
  functionName: "hit",
});

const hash = await walletProvider.sendTransaction({
  to: contractAddress as `0x${string}`,
  data: data,
});
```

### Benefits of encodeFunctionData()

1. **Proper ABI encoding** - Viem handles all encoding correctly
2. **Type safety** - TypeScript validates function names and arguments
3. **Better error messages** - Viem provides clear errors for invalid calls
4. **Industry standard** - Using the recommended pattern from Viem docs

## Changes Made

Updated all contract write operations in `blackjackActionProvider.ts`:

1. ✅ `startGame()` - Now uses `encodeFunctionData()` with value parameter
2. ✅ `hit()` - Now uses `encodeFunctionData()` for proper ABI encoding
3. ✅ `stand()` - Now uses `encodeFunctionData()` for proper ABI encoding
4. ✅ `claimWinnings()` - Now uses `encodeFunctionData()` with gameId arg

## Testing the Fix

After the fix, you should see:
- **Clear error messages** when transactions fail
- **Immediate failure** instead of silent reverts
- **Proper VRF events** when transactions succeed
- **Game state updates** after successful actions

### Debugging Future Issues

If you still see transactions succeeding but game state not changing:

1. **Check VRF Subscription Balance**
   ```bash
   # Run the debug script
   npx tsx scripts/debug-transaction.ts <tx-hash>
   ```

2. **Look for VRF Events**
   - Should see `RandomWordsRequested` event if VRF request succeeded
   - Should see `PlayerHit`/`PlayerStood` events if action executed

3. **Check Trading Period**
   - For `stand()`, trading period MUST be ended
   - Check `tradingPeriodEnds` timestamp vs current time

4. **Verify Game State**
   - `canHit` and `canStand` must be true before calling
   - Check `secondsUntilCanAct` for rate limiting

## Common VRF Issues

If VRF requests are failing:

1. **Insufficient Subscription Balance**
   - Go to https://vrf.chain.link
   - Check your subscription balance
   - Add more LINK tokens if needed

2. **VRF Coordinator Not Responding**
   - Check Chainlink status page
   - Verify coordinator address in contract

3. **Gas Limit Too Low**
   - Check `callbackGasLimit` in VRF config
   - Should be at least 100,000 for blackjack

## Next Steps

1. Test the updated code by playing a new game
2. Monitor console logs for detailed transaction info
3. Use the debug script to analyze any failing transactions
4. Check VRF subscription balance if randomness isn't working
