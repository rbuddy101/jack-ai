/**
 * Autonomous Player Control API
 *
 * Endpoints for starting, stopping, and getting status of autonomous play.
 */

import { NextResponse } from "next/server";
import autonomousPlayer from "@/lib/autonomous-player";

/**
 * POST /api/autonomous - Start or stop autonomous play
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "start") {
      console.log("🎮 API: Starting autonomous play...");
      await autonomousPlayer.start();
      const status = await autonomousPlayer.getStatus();
      return NextResponse.json({
        success: true,
        message: "Autonomous play started",
        status,
      });
    } else if (action === "stop") {
      console.log("🛑 API: Stopping autonomous play...");
      autonomousPlayer.stop();
      const status = await autonomousPlayer.getStatus();
      return NextResponse.json({
        success: true,
        message: "Autonomous play stopped and cleaned up",
        status,
      });
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'start' or 'stop'" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/autonomous - Get current status
 */
export async function GET() {
  try {
    const status = await autonomousPlayer.getStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
