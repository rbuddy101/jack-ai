/**
 * Wallet Info API
 *
 * Returns AI wallet address and ETH balance
 */

import { NextResponse } from "next/server";
import { createRPCClient } from "@/lib/rpc-client-factory";

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

    // Create RPC client to check balance
    const rpcClient = await createRPCClient();
    const balance = await rpcClient.getBalance();
    const balanceEth = Number(balance) / 1e18;

    return NextResponse.json({
      success: true,
      address: walletAddress,
      balance: balanceEth,
      balanceWei: balance.toString(),
    });
  } catch (error) {
    console.error("❌ Failed to get wallet info:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
