import { ActionProvider, CreateAction, Network, EvmWalletProvider } from "@coinbase/agentkit";
import { encodeFunctionData } from "viem";
import {
  StartGameSchema,
  HitSchema,
  StandSchema,
  GetGameStatusSchema,
  GetQuickStatusSchema,
  GetPlayerStatsSchema,
  ClaimWinningsSchema,
  CheckClaimableSchema,
} from "./schemas";
import type {
  StartGameInput,
  HitInput,
  StandInput,
  GetGameStatusInput,
  GetQuickStatusInput,
  GetPlayerStatsInput,
  ClaimWinningsInput,
  CheckClaimableInput,
} from "./schemas";
import BlackjackAbi from "../../../../../Blackjackabi.json";

// Card suits and ranks for display
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// HandState enum from contract
enum HandState {
  None = 0,
  PendingInitialDeal = 1,
  Active = 2,
  PendingHit = 3,
  PendingStand = 4,
  Busted = 5,
  Finished = 6,
}

interface CardDisplay {
  rank: string;
  suit: string;
  value: number;
}

interface GameDisplay {
  status: string;
  playerCards: CardDisplay[];
  playerTotal: number;
  dealerCards: CardDisplay[];
  dealerTotal: number;
  canHit: boolean;
  canStand: boolean;
  canStartNew: boolean;
  canCancelStuck: boolean;
  canAdminResolve: boolean;
  startedAt: bigint;
  lastActionAt: bigint;
  tradingPeriodEnds: bigint;
  secondsUntilCanAct: bigint;
  gameId: bigint;
}

/**
 * Blackjack Action Provider
 *
 * Enables AI agents to play Blackjack on-chain via contract calls.
 * Handles VRF callbacks and provides complete game functionality.
 */
export class BlackjackActionProvider extends ActionProvider<EvmWalletProvider> {
  constructor() {
    super("blackjack-action-provider", []);
  }

  /**
   * Supports Base Mainnet only
   */
  supportsNetwork = (network: Network) => {
    return network.networkId === "base-mainnet" && network.chainId === "8453";
  };

  /**
   * Get contract address
   */
  private getContractAddress(): string {
    if (!process.env.BLACKJACK_CONTRACT_ADDRESS) {
      throw new Error("BLACKJACK_CONTRACT_ADDRESS not set in environment");
    }
    return process.env.BLACKJACK_CONTRACT_ADDRESS;
  }

  /**
   * Sleep utility for polling
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Format cards for display
   */
  private formatCards(cards: CardDisplay[]): string {
    return cards.map((card) => `${card.rank}${card.suit}`).join(" ");
  }

  /**
   * Poll game state until VRF callback completes
   */
  private async pollGameState(
    walletProvider: EvmWalletProvider,
    playerAddress: string,
    initialState: HandState,
    maxWaitTime: number = 300000 // 5 minutes
  ): Promise<GameDisplay> {
    const contractAddress = this.getContractAddress();
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds
    let pollCount = 0;

    console.log(`\n🎲 Polling for VRF callback completion...`);
    console.log(`Initial state: ${HandState[initialState]}`);
    console.log(`Max wait time: ${maxWaitTime / 1000}s`);

    while (Date.now() - startTime < maxWaitTime) {
      pollCount++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Get current game state
      const result = await walletProvider.readContract({
        address: contractAddress as `0x${string}`,
        abi: BlackjackAbi,
        functionName: "getGameDisplay",
        args: [playerAddress],
      });

      const gameDisplay = result as unknown as GameDisplay;
      const currentStateStr = gameDisplay.status.toLowerCase();

      console.log(`\n[Poll #${pollCount} @ ${elapsed}s]`);
      console.log(`Current status: "${gameDisplay.status}"`);
      console.log(`Game ID: ${gameDisplay.gameId}`);
      console.log(`Can Hit: ${gameDisplay.canHit}, Can Stand: ${gameDisplay.canStand}, Can Start New: ${gameDisplay.canStartNew}`);

      // Check if we're in the expected pending state
      const inPendingState =
        (initialState === HandState.PendingInitialDeal && currentStateStr.includes("dealing")) ||
        (initialState === HandState.PendingHit && currentStateStr.includes("drawing")) ||
        (initialState === HandState.PendingStand && currentStateStr.includes("dealer playing"));

      // Check if state has transitioned OUT of pending to a final state
      const isInFinalState =
        currentStateStr.includes("your turn") ||
        currentStateStr.includes("busted") ||
        currentStateStr.includes("game finished") ||
        gameDisplay.canStartNew;

      if (pollCount === 1 && !inPendingState && !isInFinalState) {
        console.log(`⚠️ ERROR: Expected to be in ${HandState[initialState]} state but got "${gameDisplay.status}"`);
        throw new Error(`Transaction succeeded but game didn't enter expected pending state. Got status: "${gameDisplay.status}"`);
      }

      // If we were in pending state and now we're not (or we can start a new game), VRF completed
      if ((pollCount > 1 || inPendingState) && isInFinalState) {
        console.log(`✅ VRF callback completed! State changed from ${HandState[initialState]} to "${gameDisplay.status}"`);
        return gameDisplay;
      }

      console.log(`⏳ Still waiting... ${inPendingState ? '(in pending state)' : '(waiting for VRF)'}`);
      await this.sleep(pollInterval);
    }

    console.log(`❌ VRF timeout after ${maxWaitTime / 1000}s`);
    throw new Error("VRF timeout: Game state did not update within 5 minutes. You may need to cancel the stuck game.");
  }

  /**
   * Format game display into human-readable string
   */
  private formatGameDisplay(gameDisplay: GameDisplay): string {
    let output = `Game #${gameDisplay.gameId} Status: ${gameDisplay.status}\n\n`;

    if (gameDisplay.playerCards.length > 0) {
      output += `Player Hand: ${this.formatCards(gameDisplay.playerCards)} (Total: ${gameDisplay.playerTotal})\n`;
    }

    if (gameDisplay.dealerCards.length > 0) {
      output += `Dealer Hand: ${this.formatCards(gameDisplay.dealerCards)} (Total: ${gameDisplay.dealerTotal})\n`;
    }

    output += `\nActions Available:\n`;
    output += `  Can Hit: ${gameDisplay.canHit}\n`;
    output += `  Can Stand: ${gameDisplay.canStand}\n`;
    output += `  Can Start New Game: ${gameDisplay.canStartNew}\n`;

    if (gameDisplay.tradingPeriodEnds > 0n) {
      const now = BigInt(Math.floor(Date.now() / 1000));
      const timeRemaining = gameDisplay.tradingPeriodEnds > now ? gameDisplay.tradingPeriodEnds - now : 0n;
      output += `\nTrading Period: ${timeRemaining > 0n ? `Active (${timeRemaining}s remaining)` : "Ended"}\n`;
    }

    if (gameDisplay.secondsUntilCanAct > 0n) {
      output += `Time Until Can Act: ${gameDisplay.secondsUntilCanAct}s\n`;
    }

    return output;
  }

  /**
   * Start a new Blackjack game
   * @param args - feeAmount: Amount of ETH to bet (in wei)
   */
  @CreateAction({
    name: "blackjack_start_game",
    description:
      "Start a new Blackjack game with a bet amount. IMPORTANT: Before starting a new game, this action will automatically check for unclaimed winnings from any previous game and reject if winnings exist. The game will wait for VRF callback to deal initial cards. Returns the dealt cards and game state once VRF completes.",
    schema: StartGameSchema,
  })
  async startGame(walletProvider: EvmWalletProvider, args: StartGameInput): Promise<string> {
    const contractAddress = this.getContractAddress();
    let address: string = "";

    try {
      address = await walletProvider.getAddress();

      console.log("\n🎲 === Starting New Game ===");
      console.log(`Player: ${address}`);
      console.log(`Bet Amount: ${args.feeAmount} wei`);
      console.log(`Contract: ${contractAddress}`);

      // Check for previous game and unclaimed winnings
      const gameDisplay = await walletProvider.readContract({
        address: contractAddress as `0x${string}`,
        abi: BlackjackAbi,
        functionName: "getGameDisplay",
        args: [address],
      }) as unknown as GameDisplay;

      console.log("\n📊 === Current Game State Before Start ===");
      console.log(`Game ID: ${gameDisplay.gameId}`);
      console.log(`Status: "${gameDisplay.status}"`);
      console.log(`Can Start New: ${gameDisplay.canStartNew}`);
      console.log(`Player Cards: ${gameDisplay.playerCards.length}`);
      console.log(`Started At: ${gameDisplay.startedAt}`);
      console.log(`Last Action At: ${gameDisplay.lastActionAt}`);

      // If there's a previous game, check for unclaimed winnings
      if (gameDisplay.gameId > 0n) {
        console.log(`\n🔍 Checking for unclaimed winnings from game #${gameDisplay.gameId}...`);
        const claimableResult = await walletProvider.readContract({
          address: contractAddress as `0x${string}`,
          abi: BlackjackAbi,
          functionName: "getClaimableAmount",
          args: [gameDisplay.gameId, address],
        });
        const claimable = claimableResult as bigint;
        console.log(`Claimable amount: ${claimable} wei`);

        if (claimable > 0n) {
          return `❌ You have unclaimed winnings from game #${gameDisplay.gameId}. Please use blackjack_claim_winnings with gameId "${gameDisplay.gameId}" before starting a new game. Claimable amount: ${claimable.toString()} tokens`;
        }
      }

      // Check if we can actually start a new game
      if (!gameDisplay.canStartNew) {
        return `❌ Cannot start new game. Current game status: "${gameDisplay.status}". You may need to finish or cancel the current game first.`;
      }

      // Check wallet balance before attempting transaction
      console.log("\n💰 Checking wallet balance...");
      const balance = await walletProvider.getBalance();
      const balanceEth = Number(balance) / 1e18;
      const requiredEth = Number(args.feeAmount) / 1e18;
      console.log(`Current Balance: ${balanceEth.toFixed(6)} ETH`);
      console.log(`Required Bet: ${requiredEth.toFixed(6)} ETH`);
      console.log(`Estimated Gas: ~0.00001 ETH (Base is cheap!)`);

      // Only check if balance is sufficient for the bet amount
      // Gas will be handled by the smart wallet/paymaster
      if (balance < BigInt(args.feeAmount)) {
        return `❌ Insufficient Balance

Your wallet needs more ETH to play blackjack on Base Mainnet.

Current Balance: ${balanceEth.toFixed(6)} ETH
Required: ${requiredEth.toFixed(6)} ETH (bet amount)

How to fix:
1. Send at least ${requiredEth.toFixed(6)} ETH to your wallet: ${address}
2. Bridge ETH to Base: https://bridge.base.org
3. Or get free testnet ETH from faucet

Your wallet address: ${address}`;
      }

      // Call startGame with ETH value using encodeFunctionData + sendTransaction
      console.log("\n📤 Sending startGame transaction...");
      const data = encodeFunctionData({
        abi: BlackjackAbi,
        functionName: "startGame",
      });

      const hash = await walletProvider.sendTransaction({
        to: contractAddress as `0x${string}`,
        data: data,
        value: BigInt(args.feeAmount),
      });

      console.log(`✅ Transaction sent: ${hash}`);
      console.log(`   Basescan: https://basescan.org/tx/${hash}`);

      // Wait for transaction confirmation
      await walletProvider.waitForTransactionReceipt(hash);
      console.log("✅ Transaction confirmed");

      // Poll for VRF callback to complete
      const finalGameDisplay = await this.pollGameState(walletProvider, address, HandState.PendingInitialDeal);

      let output = `✅ Game started successfully!\n\n`;
      output += this.formatGameDisplay(finalGameDisplay);

      return output;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      console.error("\n❌ Error starting game:", errorMsg);
      
      // Check for insufficient balance
      if (errorMsg.includes("insufficient funds") || errorMsg.includes("failed to estimate gas")) {
        // Get wallet balance for helpful error message
        try {
          const balance = await walletProvider.getBalance();
          const balanceEth = Number(balance) / 1e18;
          const requiredEth = Number(args.feeAmount) / 1e18;
          
          return `❌ Insufficient Balance Error

Your wallet needs ETH to play blackjack on Base Mainnet.

Current Balance: ${balanceEth.toFixed(6)} ETH
Required: ~${requiredEth.toFixed(6)} ETH (bet) + gas fees

How to fix:
1. Send at least 0.001 ETH to your wallet: ${address}
2. Bridge ETH to Base: https://bridge.base.org
3. Or switch to testnet with free faucet ETH

Your wallet address: ${address}`;
        } catch (e) {
          return `❌ Error: Insufficient funds. Your wallet needs ETH to play. Please fund ${address} with ETH on Base Mainnet.`;
        }
      }

      // Provide helpful error messages
      if (errorMsg.includes("Claim previous winnings first")) {
        return `❌ Error: You have unclaimed winnings from a previous game. Use blackjack_get_game_status to find your previous game ID, then use blackjack_claim_winnings to claim before starting a new game.`;
      }
      if (errorMsg.includes("Game already active")) {
        return `❌ Error: You already have an active game. Use blackjack_get_game_status to check your current game state.`;
      }
      if (errorMsg.includes("Insufficient start game fee")) {
        return `❌ Error: The bet amount is too low. Minimum required is 0.00069 ETH (690000000000000 wei).`;
      }

      return `❌ Error starting game: ${errorMsg}`;
    }
  }

  /**
   * Hit - Draw another card
   */
  @CreateAction({
    name: "blackjack_hit",
    description:
      "Draw another card in the current Blackjack game. The game will wait for VRF callback to reveal the card. Returns the new card and updated game state once VRF completes.",
    schema: HitSchema,
  })
  async hit(walletProvider: EvmWalletProvider, args: HitInput): Promise<string> {
    try {
      const contractAddress = this.getContractAddress();
      const address = await walletProvider.getAddress();

      console.log(`\n👊 === Hit Action Starting ===`);
      console.log(`Player: ${address}`);
      console.log(`Contract: ${contractAddress}`);

      // Get current game state BEFORE hit
      const preHitState = await walletProvider.readContract({
        address: contractAddress as `0x${string}`,
        abi: BlackjackAbi,
        functionName: "getGameDisplay",
        args: [address],
      }) as unknown as GameDisplay;

      console.log(`\n📋 === Pre-Hit Game State ===`);
      console.log(`Status: "${preHitState.status}"`);
      console.log(`Can Hit: ${preHitState.canHit}`);
      console.log(`Seconds Until Can Act: ${preHitState.secondsUntilCanAct}`);
      console.log(`Trading Period Ends: ${preHitState.tradingPeriodEnds}`);
      const now = Math.floor(Date.now() / 1000);
      console.log(`Current Time: ${now}`);
      console.log(`Trading Ended: ${now > Number(preHitState.tradingPeriodEnds)}`);

      if (!preHitState.canHit) {
        throw new Error(`Cannot hit: canHit is false. Status: "${preHitState.status}"`);
      }

      // Call hit() using encodeFunctionData + sendTransaction
      console.log(`\n📤 Encoding hit() function call...`);
      const data = encodeFunctionData({
        abi: BlackjackAbi,
        functionName: "hit",
      });

      console.log(`📤 Sending hit() transaction...`);
      const hash = await walletProvider.sendTransaction({
        to: contractAddress as `0x${string}`,
        data: data,
      });

      console.log(`\n📝 Hit transaction hash: ${hash}`);
      console.log(`   Basescan: https://basescan.org/tx/${hash}`);

      // Wait for transaction confirmation
      console.log(`⏳ Waiting for transaction receipt...`);
      const receipt = await walletProvider.waitForTransactionReceipt(hash);
      console.log(`\n📦 Transaction Receipt:`);
      console.log(`  Status: ${receipt.status}`);
      console.log(`  Block: ${receipt.blockNumber}`);
      console.log(`  Gas used: ${receipt.gasUsed?.toString() || 'N/A'}`);

      if (receipt.status === "reverted" || receipt.status === 0 || receipt.status === "0x0") {
        throw new Error("Hit transaction reverted!");
      }

      // Poll for VRF callback to complete
      const gameDisplay = await this.pollGameState(walletProvider, address, HandState.PendingHit);

      let output = `✅ Hit action completed!\n\n`;
      output += this.formatGameDisplay(gameDisplay);

      return output;
    } catch (error) {
      return `❌ Error hitting: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Stand - End player turn and let dealer play
   */
  @CreateAction({
    name: "blackjack_stand",
    description:
      "End your turn and let the dealer play in the current Blackjack game. The game will wait for VRF callback to deal dealer cards and determine the winner. Returns final game result once VRF completes.",
    schema: StandSchema,
  })
  async stand(walletProvider: EvmWalletProvider, args: StandInput): Promise<string> {
    try {
      const contractAddress = this.getContractAddress();
      const address = await walletProvider.getAddress();

      console.log(`\n🎯 === Stand Action Starting ===`);
      console.log(`Player: ${address}`);
      console.log(`Contract: ${contractAddress}`);

      // Get current game state BEFORE stand
      const preStandState = await walletProvider.readContract({
        address: contractAddress as `0x${string}`,
        abi: BlackjackAbi,
        functionName: "getGameDisplay",
        args: [address],
      }) as unknown as GameDisplay;

      console.log(`\n📋 === Pre-Stand Game State ===`);
      console.log(`Status: "${preStandState.status}"`);
      console.log(`Can Stand: ${preStandState.canStand}`);
      console.log(`Seconds Until Can Act: ${preStandState.secondsUntilCanAct}`);
      console.log(`Trading Period Ends: ${preStandState.tradingPeriodEnds}`);
      const now = Math.floor(Date.now() / 1000);
      console.log(`Current Time: ${now}`);
      console.log(`Trading Ended: ${now > Number(preStandState.tradingPeriodEnds)}`);

      if (!preStandState.canStand) {
        throw new Error(`Cannot stand: canStand is false. Status: "${preStandState.status}"`);
      }

      // Check VRF configuration
      try {
        const vrfConfig = await walletProvider.readContract({
          address: contractAddress as `0x${string}`,
          abi: BlackjackAbi,
          functionName: "vrfConfig",
          args: [],
        });
        console.log(`\n🎲 VRF Configuration:`);
        console.log(`  VRF Config:`, vrfConfig);
        console.log(`  Note: vrfFee = 0 is expected in subscription mode`);
      } catch (e) {
        console.log(`  Could not read VRF config:`, e);
      }

      // Call stand() using encodeFunctionData + sendTransaction
      console.log(`\n📤 Encoding stand() function call...`);
      const data = encodeFunctionData({
        abi: BlackjackAbi,
        functionName: "stand",
      });

      console.log(`📤 Sending stand() transaction...`);
      const hash = await walletProvider.sendTransaction({
        to: contractAddress as `0x${string}`,
        data: data,
      });

      console.log(`📝 Stand transaction sent: ${hash}`);

      // Wait for transaction confirmation
      const receipt = await walletProvider.waitForTransactionReceipt(hash);
      console.log(`\n📦 Transaction Receipt:`);
      console.log(`  Block: ${receipt.blockNumber}`);
      console.log(`  Status: ${receipt.status}`);
      console.log(`  Gas used: ${receipt.gasUsed?.toString() || 'undefined'}`);
      console.log(`  Effective gas price: ${receipt.effectiveGasPrice?.toString() || 'undefined'}`);
      console.log(`  From: ${receipt.from}`);
      console.log(`  To: ${receipt.to}`);
      console.log(`  Logs count: ${receipt.logs?.length || 0}`);

      if (receipt.logs && receipt.logs.length > 0) {
        console.log(`\n📜 Transaction Logs:`);
        receipt.logs.forEach((log: any, i: number) => {
          console.log(`  Log ${i}:`);
          console.log(`    Address: ${log.address}`);
          console.log(`    Topics: ${JSON.stringify(log.topics)}`);
        });
      }

      // Check if transaction reverted
      if (receipt.status === "reverted" || receipt.status === 0 || receipt.status === "0x0") {
        throw new Error("Transaction reverted - stand() call failed. Check if game state is Active and trading period has ended.");
      }

      // If status is not explicitly "success" or 1, warn
      if (receipt.status !== "success" && receipt.status !== 1 && receipt.status !== "0x1") {
        console.log(`⚠️ WARNING: Unusual transaction status: ${receipt.status}`);
      }

      // Check the raw game state from contract storage
      const rawGameState = await walletProvider.readContract({
        address: contractAddress as `0x${string}`,
        abi: BlackjackAbi,
        functionName: "games",
        args: [address],
      });

      console.log(`\n🔍 Raw game state from contract:`);
      console.log(`  Raw state data:`, rawGameState);

      // Check immediate display state
      const immediateState = await walletProvider.readContract({
        address: contractAddress as `0x${string}`,
        abi: BlackjackAbi,
        functionName: "getGameDisplay",
        args: [address],
      }) as unknown as GameDisplay;

      console.log(`\n📊 Immediate state after stand transaction:`);
      console.log(`  Status: "${immediateState.status}"`);
      console.log(`  Can Hit: ${immediateState.canHit}`);
      console.log(`  Can Stand: ${immediateState.canStand}`);
      console.log(`  Trading Period Ends: ${immediateState.tradingPeriodEnds}`);
      console.log(`  Seconds Until Can Act: ${immediateState.secondsUntilCanAct}`);

      const nowAfterTx = Math.floor(Date.now() / 1000);
      const tradingEnded = immediateState.tradingPeriodEnds > 0n
        ? nowAfterTx >= Number(immediateState.tradingPeriodEnds)
        : true;
      console.log(`  Current timestamp: ${nowAfterTx}`);
      console.log(`  Trading period ended: ${tradingEnded}`);

      // If state didn't change to "Dealer playing..." then transaction may have reverted
      if (!immediateState.status.toLowerCase().includes("dealer playing")) {
        console.log(`\n⚠️ WARNING: State did not change to PendingStand!`);
        console.log(`  Expected: Status containing "Dealer playing..."`);
        console.log(`  Got: "${immediateState.status}"`);

        // Check if we can stand - if yes, transaction probably reverted silently
        if (immediateState.status === "Your turn" && immediateState.canStand) {
          // Let's try to get more info about why it might have failed
          console.log(`\n🔎 Analyzing why stand() might have failed:`);
          console.log(`  Game state shows "Your turn" and canStand=true`);
          console.log(`  This suggests the transaction reverted but was marked as successful`);
          console.log(`  Possible causes:`);
          console.log(`    1. VRF coordinator not responding`);
          console.log(`    2. Insufficient VRF subscription balance`);
          console.log(`    3. Contract reentrancy guard triggered`);
          console.log(`    4. Silent revert in _requestVrf() function`);

          throw new Error("Stand transaction appeared to succeed but game state didn't change. The VRF request likely failed. Check VRF subscription balance and coordinator status.");
        }
      }

      // Poll for VRF callback to complete
      const gameDisplay = await this.pollGameState(walletProvider, address, HandState.PendingStand);

      let output = `✅ Stand action completed!\n\n`;
      output += this.formatGameDisplay(gameDisplay);

      return output;
    } catch (error) {
      console.error(`\n❌ Stand error:`, error);
      return `❌ Error standing: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Get full game status
   */
  @CreateAction({
    name: "blackjack_get_game_status",
    description:
      "Get the full game status for a player including all cards, totals, available actions, and timing information.",
    schema: GetGameStatusSchema,
  })
  async getGameStatus(walletProvider: EvmWalletProvider, args: GetGameStatusInput): Promise<string> {
    try {
      const contractAddress = this.getContractAddress();
      const playerAddress = args.playerAddress || (await walletProvider.getAddress());

      console.log(`\n📊 === Getting Game Display ===`);
      console.log(`Contract: ${contractAddress}`);
      console.log(`Player: ${playerAddress}`);

      const result = await walletProvider.readContract({
        address: contractAddress as `0x${string}`,
        abi: BlackjackAbi,
        functionName: "getGameDisplay",
        args: [playerAddress],
      });

      const gameDisplay = result as unknown as GameDisplay;

      console.log(`\n📦 === Raw Game Display Response ===`);
      console.log(JSON.stringify(gameDisplay, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      , 2));

      console.log(`\n🎮 === Parsed Game Data ===`);
      console.log(`Game ID: ${gameDisplay.gameId}`);
      console.log(`Status: "${gameDisplay.status}"`);
      console.log(`Player Cards: ${gameDisplay.playerCards.length}`);
      console.log(`Player Total: ${gameDisplay.playerTotal}`);
      console.log(`Dealer Cards: ${gameDisplay.dealerCards.length}`);
      console.log(`Dealer Total: ${gameDisplay.dealerTotal}`);
      console.log(`Can Hit: ${gameDisplay.canHit}`);
      console.log(`Can Stand: ${gameDisplay.canStand}`);
      console.log(`Can Start New: ${gameDisplay.canStartNew}`);
      console.log(`Can Cancel Stuck: ${gameDisplay.canCancelStuck}`);
      console.log(`Can Admin Resolve: ${gameDisplay.canAdminResolve}`);
      console.log(`Started At: ${gameDisplay.startedAt}`);
      console.log(`Last Action At: ${gameDisplay.lastActionAt}`);
      console.log(`Trading Period Ends: ${gameDisplay.tradingPeriodEnds}`);
      console.log(`Seconds Until Can Act: ${gameDisplay.secondsUntilCanAct}`);

      const now = Math.floor(Date.now() / 1000);
      console.log(`\n⏰ === Timing Analysis ===`);
      console.log(`Current Time: ${now}`);
      console.log(`Time Since Last Action: ${now - Number(gameDisplay.lastActionAt)}s`);
      console.log(`Time Since Started: ${now - Number(gameDisplay.startedAt)}s`);
      console.log(`Trading Period Active: ${gameDisplay.tradingPeriodEnds > 0n && now < Number(gameDisplay.tradingPeriodEnds)}`);
      if (gameDisplay.tradingPeriodEnds > 0n) {
        const tradingTimeRemaining = Number(gameDisplay.tradingPeriodEnds) - now;
        console.log(`Trading Time Remaining: ${tradingTimeRemaining > 0 ? tradingTimeRemaining + 's' : 'Ended'}`);
      }

      console.log(`\n===============================\n`);

      return this.formatGameDisplay(gameDisplay);
    } catch (error) {
      console.error(`\n❌ Error getting game status:`, error);
      return `❌ Error getting game status: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Get quick game status (lightweight)
   */
  @CreateAction({
    name: "blackjack_get_quick_status",
    description: "Get a quick status check of the current game (state, totals, and whether you can act).",
    schema: GetQuickStatusSchema,
  })
  async getQuickStatus(walletProvider: EvmWalletProvider, args: GetQuickStatusInput): Promise<string> {
    try {
      const contractAddress = this.getContractAddress();
      const playerAddress = args.playerAddress || (await walletProvider.getAddress());

      const result = await walletProvider.readContract({
        address: contractAddress as `0x${string}`,
        abi: BlackjackAbi,
        functionName: "getQuickStatus",
        args: [playerAddress],
      });

      const [status, playerTotal, dealerTotal, canAct, tradingPeriodEnds, gameId] = result as [
        string,
        number,
        number,
        boolean,
        bigint,
        bigint,
      ];

      let output = `Game #${gameId} Quick Status:\n\n`;
      output += `Status: ${status}\n`;
      output += `Player Total: ${playerTotal}\n`;
      output += `Dealer Total: ${dealerTotal}\n`;
      output += `Can Act: ${canAct}\n`;

      if (tradingPeriodEnds > 0n) {
        const now = BigInt(Math.floor(Date.now() / 1000));
        const timeRemaining = tradingPeriodEnds > now ? tradingPeriodEnds - now : 0n;
        output += `Trading Period: ${timeRemaining > 0n ? `Active (${timeRemaining}s remaining)` : "Ended"}\n`;
      }

      return output;
    } catch (error) {
      return `❌ Error getting quick status: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Get player statistics
   */
  @CreateAction({
    name: "blackjack_get_player_stats",
    description: "Get player statistics including games played, wins, losses, pushes, busts, and win rate.",
    schema: GetPlayerStatsSchema,
  })
  async getPlayerStats(walletProvider: EvmWalletProvider, args: GetPlayerStatsInput): Promise<string> {
    try {
      const contractAddress = this.getContractAddress();
      const playerAddress = args.playerAddress || (await walletProvider.getAddress());

      const result = await walletProvider.readContract({
        address: contractAddress as `0x${string}`,
        abi: BlackjackAbi,
        functionName: "getStats",
        args: [playerAddress],
      });

      const [gamesPlayed, wins, losses, pushes, busts, winRate] = result as [
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
      ];

      let output = `📊 Player Statistics for ${playerAddress}\n\n`;
      output += `Games Played: ${gamesPlayed}\n`;
      output += `Wins: ${wins}\n`;
      output += `Losses: ${losses}\n`;
      output += `Pushes (Ties): ${pushes}\n`;
      output += `Busts: ${busts}\n`;
      output += `Win Rate: ${winRate}%\n`;

      return output;
    } catch (error) {
      return `❌ Error getting player stats: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Check claimable amount for a game
   */
  @CreateAction({
    name: "blackjack_check_claimable",
    description:
      "Check how much can be claimed from a completed game. Returns the claimable token amount. Use this before starting a new game to see if you have unclaimed winnings.",
    schema: CheckClaimableSchema,
  })
  async checkClaimable(walletProvider: EvmWalletProvider, args: CheckClaimableInput): Promise<string> {
    try {
      const contractAddress = this.getContractAddress();
      const playerAddress = args.playerAddress || (await walletProvider.getAddress());
      const gameId = BigInt(args.gameId);

      const result = await walletProvider.readContract({
        address: contractAddress as `0x${string}`,
        abi: BlackjackAbi,
        functionName: "getClaimableAmount",
        args: [gameId, playerAddress],
      });

      const claimable = result as bigint;

      if (claimable > 0n) {
        return `💰 Claimable amount from game #${gameId}: ${claimable.toString()} tokens\n\nUse blackjack_claim_winnings to claim this amount.`;
      } else {
        return `ℹ️ No claimable amount from game #${gameId}. Either the game is not finished, you didn't win, or you already claimed.`;
      }
    } catch (error) {
      return `❌ Error checking claimable amount: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Claim winnings from a completed game
   */
  @CreateAction({
    name: "blackjack_claim_winnings",
    description:
      "Claim winnings from a completed Blackjack game. You must claim previous winnings before starting a new game. Returns transaction details and claimed amount.",
    schema: ClaimWinningsSchema,
  })
  async claimWinnings(walletProvider: EvmWalletProvider, args: ClaimWinningsInput): Promise<string> {
    try {
      const contractAddress = this.getContractAddress();
      const address = await walletProvider.getAddress();
      const gameId = BigInt(args.gameId);

      // Check claimable amount first
      const claimableResult = await walletProvider.readContract({
        address: contractAddress as `0x${string}`,
        abi: BlackjackAbi,
        functionName: "getClaimableAmount",
        args: [gameId, address],
      });
      const claimable = claimableResult as bigint;

      if (claimable === 0n) {
        return `ℹ️ No winnings to claim from game #${gameId}. Either the game is not finished, you didn't win, or you already claimed.`;
      }

      // Call claimWinnings(gameId) using encodeFunctionData + sendTransaction
      const data = encodeFunctionData({
        abi: BlackjackAbi,
        functionName: "claimWinnings",
        args: [gameId],
      });

      const hash = await walletProvider.sendTransaction({
        to: contractAddress as `0x${string}`,
        data: data,
      });

      // Wait for transaction confirmation
      await walletProvider.waitForTransactionReceipt(hash);

      let output = `✅ Successfully claimed winnings from game #${gameId}!\n\n`;
      output += `Amount Claimed: ${claimable.toString()} tokens\n`;
      output += `Transaction Hash: ${hash}\n\n`;
      output += `You can now start a new game if you wish!`;

      return output;
    } catch (error) {
      return `❌ Error claiming winnings: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

/**
 * Factory function to create Blackjack action provider
 */
export function blackjackActionProvider(): BlackjackActionProvider {
  return new BlackjackActionProvider();
}