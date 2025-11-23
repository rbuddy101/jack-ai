# 🃏 Autonomous AI Blackjack Agent

An autonomous AI agent that plays blackjack on the Base blockchain, powered by [Coinbase AgentKit](https://github.com/coinbase/agentkit) and OpenAI. The agent makes strategic decisions, executes on-chain transactions, and automatically claims winnings—all while streaming real-time gameplay updates to a Next.js dashboard.

## ✨ Features

- **🤖 Autonomous Gameplay**: AI agent makes strategic hit/stand decisions using GPT-4
- **📊 Real-time Dashboard**: Live card display and game state visualization via Server-Sent Events (SSE)
- **🎲 Provably Fair**: Uses Chainlink VRF (Verifiable Random Function) for cryptographically secure card dealing
- **💰 Automatic Claiming**: Detects completed games and claims winnings automatically
- **🔄 Smart State Management**: 11-state game loop handles VRF callbacks and trading periods
- **⛓️ Base Network**: Deployed on Base blockchain for low-cost transactions
- **📈 Statistics Tracking**: Monitors wins, losses, pushes, busts, and win streaks

## 🎮 How It Works

### Hybrid Architecture

The application uses a **dual-path architecture** for optimal performance:

1. **Direct RPC Path** - Efficient contract reads and claiming
   - Game status checks (`getGameStatus()`, `getPlayerStats()`)
   - Direct claiming of winnings bypasses AI for speed
   - VRF state polling and trading period detection

2. **AI Agent Path** - Strategic gameplay decisions
   - AI analyzes game state and chooses hit/stand
   - Executes actions through custom blackjack action provider
   - Natural language conversation interface with blockchain execution

### Game Flow

```
1. Check for existing game → Resume if active
2. Start new game with ETH bet → Wait for VRF initial deal
3. AI evaluates hand → Make hit/stand decision
4. Execute action → Wait for VRF card dealing
5. Repeat until game complete
6. Automatically claim winnings
7. Stop (single-game mode)
```

### VRF Integration

The blackjack contract uses **Chainlink VRF** for provably fair randomness:
- All card dealing is cryptographically secure and verifiable on-chain
- VRF callbacks typically complete within 2-30 seconds
- Application polls contract every 2 seconds for state changes

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- [Coinbase Developer Platform](https://portal.cdp.coinbase.com/) API keys
- [OpenAI API](https://platform.openai.com/api-keys) key
- ETH on Base Sepolia testnet (for development)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd onchain-agent
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your API keys:
   ```env
   # Required: OpenAI API Key
   OPENAI_API_KEY=sk-...

   # Required: Coinbase Developer Platform credentials
   CDP_API_KEY_ID=...
   CDP_API_KEY_SECRET=...

   # Optional: Will be auto-generated if not provided
   CDP_WALLET_SECRET=...
   AI_WALLET=0x...

   # Contract configuration
   BLACKJACK_CONTRACT_ADDRESS=0x1234... # Provided in .env.example
   NETWORK_ID=base-sepolia

   # Betting configuration
   BET_AMOUNT=700000000000000 # 0.0007 ETH in wei
   NEXT_PUBLIC_BET_AMOUNT=0.0007
   ```

4. **Fund your wallet**

   The application will generate a wallet on first run and save it to `wallet_data.txt`. Fund this address with Sepolia ETH using a [Base Sepolia faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet).

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open the dashboard**

   Navigate to [http://localhost:3000](http://localhost:3000) to see the autonomous player dashboard.

## 🎯 Usage

### Autonomous Mode

The primary interface is the **autonomous player dashboard**:

1. **Start Autonomous Play** - Click to begin a single game
2. **Watch Live** - Real-time card display shows dealer and player hands
3. **View Statistics** - Track wins, losses, and performance metrics
4. **Action Log** - See detailed event history

The agent will:
- Start a new game (or resume/claim existing)
- Make strategic decisions based on card values
- Execute transactions on-chain
- Wait for VRF callbacks
- Claim winnings automatically
- Stop after one game (click Start again for next game)

### Chat Interface (Optional)

You can also interact with the agent via natural language:

```
You: "Start a blackjack game with 0.001 ETH"
Agent: [Executes startGame transaction and waits for VRF]

You: "What's the game status?"
Agent: "Your hand: 15 (7♠ 8♥), Dealer: 10♦. You can hit or stand."

You: "Hit me"
Agent: [Executes hit transaction, waits for VRF card]
```

## 📁 Project Structure

```
onchain-agent/
├── app/
│   ├── api/
│   │   ├── agent/              # AI agent endpoints
│   │   │   ├── action-providers/
│   │   │   │   └── blackjack/  # Custom blackjack actions
│   │   │   ├── prepare-agentkit.ts  # AgentKit initialization
│   │   │   ├── create-agent.ts      # OpenAI agent setup
│   │   │   └── route.ts             # Chat API endpoint
│   │   └── autonomous/
│   │       ├── route.ts         # Control autonomous player
│   │       └── stream/
│   │           └── route.ts     # SSE stream endpoint
│   ├── hooks/
│   │   └── useAutonomousPlayer.ts  # SSE client hook
│   └── page.tsx                 # Main dashboard page
├── components/
│   ├── GameDashboard.tsx        # Main dashboard component
│   ├── CardDisplay.tsx          # Real-time card visualization
│   ├── StateMachine.tsx         # State machine diagram
│   ├── GameStats.tsx            # Statistics display
│   └── ActionLog.tsx            # Event history
├── lib/
│   ├── game-loop.ts             # 11-state game loop
│   ├── autonomous-player.ts     # Player manager singleton
│   └── rpc-client.ts            # Direct RPC contract interface
├── Blackjack.sol                # Smart contract source (reference)
├── Blackjackabi.json            # Contract ABI
└── CLAUDE.md                    # Detailed technical documentation
```

## 🛠️ Development

### Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Production build
npm start        # Run production server
npm run lint     # Run ESLint
```

### Key Configuration Files

- **`app/api/agent/prepare-agentkit.ts`** - Configure AgentKit, wallet provider, and action providers
- **`app/api/agent/create-agent.ts`** - Configure OpenAI model and system prompts
- **`lib/game-loop.ts`** - Adjust game loop behavior and state transitions
- **`.env`** - Environment variables for API keys and contract addresses

### Custom Action Provider

The blackjack action provider (`app/api/agent/action-providers/blackjack/`) implements:

- `blackjack_start_game` - Start game with ETH bet
- `blackjack_hit` - Draw another card
- `blackjack_stand` - End player's turn
- `blackjack_claim_winnings` - Claim winnings from completed game
- `blackjack_get_game_status` - Get full game state
- `blackjack_get_player_stats` - Get lifetime statistics

All actions automatically handle VRF polling and wait for callbacks to complete.

## 🔗 Smart Contract

The blackjack game is powered by a smart contract deployed on Base:

- **Network**: Base Sepolia (testnet) / Base Mainnet (production)
- **Contract**: See `BLACKJACK_CONTRACT_ADDRESS` in `.env.example`
- **Source**: `Blackjack.sol` (included for reference)
- **Features**:
  - Chainlink VRF for provably fair randomness
  - Prediction market trading period (60 seconds)
  - Single game per address constraint
  - Automatic payout calculation

## 📖 Documentation

- **[CLAUDE.md](/CLAUDE.md)** - Comprehensive technical documentation
  - Architecture deep-dive
  - State machine details
  - API reference
  - Development workflows

## 🤝 Contributing

Contributions are welcome! This project demonstrates:

- Custom AgentKit action providers
- On-chain gaming with VRF
- Real-time web3 dashboards
- Autonomous agent architectures

Feel free to:
- Add new game strategies
- Improve the AI decision-making
- Enhance the dashboard UI
- Add analytics and insights

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Resources

- [Coinbase AgentKit](https://github.com/coinbase/agentkit) - AI agent framework
- [Coinbase Developer Platform](https://docs.cdp.coinbase.com/) - CDP documentation
- [Chainlink VRF](https://docs.chain.link/vrf) - Verifiable randomness
- [Base Network](https://base.org/) - Ethereum L2 blockchain
- [Next.js](https://nextjs.org/) - React framework

---

**Built with ❤️ using Coinbase AgentKit**
