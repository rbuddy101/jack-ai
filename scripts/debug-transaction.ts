import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import BlackjackAbi from '../Blackjackabi.json';

/**
 * Debug script to analyze a transaction and check for events
 *
 * Usage: npx tsx scripts/debug-transaction.ts <tx-hash>
 */

const BLACKJACK_CONTRACT = process.env.BLACKJACK_CONTRACT_ADDRESS as `0x${string}`;

if (!BLACKJACK_CONTRACT) {
  console.error('❌ BLACKJACK_CONTRACT_ADDRESS not set in .env');
  process.exit(1);
}

async function main() {
  const txHash = process.argv[2];

  if (!txHash) {
    console.error('❌ Usage: npx tsx scripts/debug-transaction.ts <tx-hash>');
    process.exit(1);
  }

  console.log(`\n🔍 Analyzing transaction: ${txHash}`);
  console.log(`📍 Contract: ${BLACKJACK_CONTRACT}`);
  console.log(`🌐 Network: Base Mainnet\n`);

  const client = createPublicClient({
    chain: base,
    transport: http(),
  });

  // Get transaction receipt
  const receipt = await client.getTransactionReceipt({
    hash: txHash as `0x${string}`,
  });

  console.log(`📦 Transaction Receipt:`);
  console.log(`  Status: ${receipt.status}`);
  console.log(`  Block: ${receipt.blockNumber}`);
  console.log(`  From: ${receipt.from}`);
  console.log(`  To: ${receipt.to}`);
  console.log(`  Gas Used: ${receipt.gasUsed}`);
  console.log(`  Logs: ${receipt.logs.length} events\n`);

  // Check for Blackjack contract events
  const blackjackLogs = receipt.logs.filter(
    (log) => log.address.toLowerCase() === BLACKJACK_CONTRACT.toLowerCase()
  );

  console.log(`🎰 Blackjack Contract Events: ${blackjackLogs.length}\n`);

  if (blackjackLogs.length === 0) {
    console.log(`⚠️  NO EVENTS FROM BLACKJACK CONTRACT!`);
    console.log(`\nThis means the contract function likely reverted or didn't execute.`);
    console.log(`Possible reasons:`);
    console.log(`  1. VRF coordinator rejected the request`);
    console.log(`  2. VRF subscription out of funds`);
    console.log(`  3. Game state check failed (canHit/canStand was false)`);
    console.log(`  4. Trading period still active (for stand)`);
    console.log(`  5. Silent revert in _requestVrf()`);

    // Check for VRF Coordinator events
    console.log(`\n🎲 Checking for VRF-related events in ALL logs...`);
    const vrfLogs = receipt.logs.filter((log) => {
      // VRF RandomWordsRequested event signature
      const vrfRequestTopic = '0x63373d1c6e3bc03e3eb9e15cccdfb05f95ad1d59555af0a31c0c4a20ea5a9ab5';
      return log.topics[0] === vrfRequestTopic;
    });

    if (vrfLogs.length > 0) {
      console.log(`✅ Found ${vrfLogs.length} VRF request(s)!`);
      vrfLogs.forEach((log, i) => {
        console.log(`\n  VRF Request ${i + 1}:`);
        console.log(`    From: ${log.address}`);
        console.log(`    Request ID (topic 1): ${log.topics[1]}`);
      });
    } else {
      console.log(`❌ NO VRF RandomWordsRequested events found!`);
      console.log(`   This confirms the VRF request was NOT made.`);
    }
  } else {
    // Decode events
    for (const log of blackjackLogs) {
      try {
        const eventName = findEventName(log.topics[0]);
        console.log(`📣 Event: ${eventName || 'Unknown'}`);
        console.log(`   Topics: ${log.topics.length}`);
        console.log(`   Data: ${log.data.length} bytes`);

        if (eventName) {
          console.log(`   Details:`, log);
        }
        console.log();
      } catch (error) {
        console.log(`   Could not decode event`);
        console.log(`   Topics:`, log.topics);
        console.log();
      }
    }
  }

  // Get current game state
  console.log(`\n📊 Current Game State:\n`);

  // We need the player address - get it from the transaction
  const tx = await client.getTransaction({
    hash: txHash as `0x${string}`,
  });

  const playerAddress = tx.from;
  console.log(`Player: ${playerAddress}\n`);

  try {
    const gameDisplay = await client.readContract({
      address: BLACKJACK_CONTRACT,
      abi: BlackjackAbi,
      functionName: 'getGameDisplay',
      args: [playerAddress],
    }) as any;

    console.log(`Game Status: "${gameDisplay.status}"`);
    console.log(`Game ID: ${gameDisplay.gameId}`);
    console.log(`Can Hit: ${gameDisplay.canHit}`);
    console.log(`Can Stand: ${gameDisplay.canStand}`);
    console.log(`Can Start New: ${gameDisplay.canStartNew}`);
    console.log(`Seconds Until Can Act: ${gameDisplay.secondsUntilCanAct}`);

    const now = Math.floor(Date.now() / 1000);
    console.log(`\n⏰ Timing:`);
    console.log(`Current Time: ${now}`);
    console.log(`Trading Period Ends: ${gameDisplay.tradingPeriodEnds}`);
    console.log(`Trading Active: ${now < Number(gameDisplay.tradingPeriodEnds)}`);
  } catch (error) {
    console.error(`❌ Error reading game state:`, error);
  }

  // Check VRF config
  console.log(`\n🎲 VRF Configuration:\n`);
  try {
    const vrfConfig = await client.readContract({
      address: BLACKJACK_CONTRACT,
      abi: BlackjackAbi,
      functionName: 'vrfConfig',
      args: [],
    }) as any;

    console.log(`Subscription ID: ${vrfConfig.subscriptionId}`);
    console.log(`Callback Gas Limit: ${vrfConfig.callbackGasLimit}`);
    console.log(`Request Confirmations: ${vrfConfig.requestConfirmations}`);
    console.log(`VRF Fee: ${vrfConfig.vrfFee}`);
    console.log(`\nNote: vrfFee = 0 is expected in subscription mode`);
  } catch (error) {
    console.error(`❌ Error reading VRF config:`, error);
  }
}

function findEventName(topic: string): string | null {
  const eventSignatures: Record<string, string> = {
    '0x': 'PlayerHit',
    '0x': 'PlayerStood',
    '0x': 'PlayerBusted',
    '0x': 'GameResolved',
    '0x': 'GameStarted',
    '0x': 'TradingPeriodStarted',
    '0x63373d1c6e3bc03e3eb9e15cccdfb05f95ad1d59555af0a31c0c4a20ea5a9ab5': 'VRF:RandomWordsRequested',
  };

  return eventSignatures[topic] || null;
}

main().catch(console.error);
