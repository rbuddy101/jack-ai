/**
 * Wallet Info API
 *
 * Returns AI wallet address, ETH balance, and wASS token balance
 */

import { NextResponse } from "next/server";
import { createRPCClient } from "@/lib/rpc-client-factory";
import { createPublicClient, http, formatUnits } from "viem";
import { base, baseSepolia } from "viem/chains";

const WASS_CONTRACT_ADDRESS = "0x445040FfaAb67992Ba1020ec2558CD6754d83Ad6";

// ERC20 ABI for balanceOf
const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function GET() {
  try {
    // Get wallet address from env
    const walletAddress = process.env.AI_WALLET;

    if (!walletAddress) {
      return NextResponse.json(
        { error: "AI_WALLET not configured" },
        { status: 500 }
      );
    }

    // Create RPC client to check ETH balance
    const rpcClient = await createRPCClient();
    const balance = await rpcClient.getBalance();
    const balanceEth = Number(balance) / 1e18;

    // Create public client for reading wASS balance
    const networkId = process.env.NETWORK_ID || "base-sepolia";
    const chain = networkId === "base-mainnet" ? base : baseSepolia;
    const publicClient = createPublicClient({
      chain,
      transport: http(process.env.RPC_URL),
    });

    // Get wASS balance
    const wAssBalance = await publicClient.readContract({
      address: WASS_CONTRACT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [walletAddress as `0x${string}`],
    });

    // Get wASS decimals
    const wAssDecimals = await publicClient.readContract({
      address: WASS_CONTRACT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "decimals",
    });

    const wAssBalanceFormatted = formatUnits(wAssBalance, wAssDecimals);

    return NextResponse.json({
      success: true,
      address: walletAddress,
      balance: balanceEth,
      balanceWei: balance.toString(),
      wAssBalance: parseFloat(wAssBalanceFormatted),
      wAssBalanceRaw: wAssBalance.toString(),
    });
  } catch (error) {
    console.error("❌ Failed to get wallet info:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
