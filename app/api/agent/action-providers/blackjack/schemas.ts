import { z } from "zod";

/**
 * Schema for starting a new Blackjack game
 */
export const StartGameSchema = z
  .object({
    feeAmount: z
      .string()
      .describe("Amount of ETH to bet on the game (in wei as string, e.g., '1000000000000000' for 0.001 ETH)"),
  })
  .strip()
  .describe("Instructions for starting a new Blackjack game");

export type StartGameInput = z.infer<typeof StartGameSchema>;

/**
 * Schema for hitting (drawing another card)
 */
export const HitSchema = z
  .object({})
  .strip()
  .describe("Instructions for hitting (drawing another card) in the current Blackjack game");

export type HitInput = z.infer<typeof HitSchema>;

/**
 * Schema for standing (ending player turn)
 */
export const StandSchema = z
  .object({})
  .strip()
  .describe("Instructions for standing (ending turn) in the current Blackjack game");

export type StandInput = z.infer<typeof StandSchema>;

/**
 * Schema for getting full game status
 */
export const GetGameStatusSchema = z
  .object({
    playerAddress: z
      .string()
      .optional()
      .describe("Player address to check status for (optional, defaults to connected wallet)"),
  })
  .strip()
  .describe("Instructions for getting full Blackjack game status including cards, totals, and available actions");

export type GetGameStatusInput = z.infer<typeof GetGameStatusSchema>;

/**
 * Schema for getting quick game status
 */
export const GetQuickStatusSchema = z
  .object({
    playerAddress: z
      .string()
      .optional()
      .describe("Player address to check status for (optional, defaults to connected wallet)"),
  })
  .strip()
  .describe("Instructions for getting quick Blackjack game status (state and totals only)");

export type GetQuickStatusInput = z.infer<typeof GetQuickStatusSchema>;

/**
 * Schema for getting player statistics
 */
export const GetPlayerStatsSchema = z
  .object({
    playerAddress: z
      .string()
      .optional()
      .describe("Player address to get stats for (optional, defaults to connected wallet)"),
  })
  .strip()
  .describe("Instructions for getting player statistics (wins, losses, busts, win rate)");

export type GetPlayerStatsInput = z.infer<typeof GetPlayerStatsSchema>;

/**
 * Schema for claiming winnings
 */
export const ClaimWinningsSchema = z
  .object({
    gameId: z
      .string()
      .describe("Game ID to claim winnings from (as string)"),
  })
  .strip()
  .describe("Instructions for claiming winnings from a completed Blackjack game");

export type ClaimWinningsInput = z.infer<typeof ClaimWinningsSchema>;

/**
 * Schema for checking claimable amount
 */
export const CheckClaimableSchema = z
  .object({
    gameId: z
      .string()
      .describe("Game ID to check claimable amount for (as string)"),
    playerAddress: z
      .string()
      .optional()
      .describe("Player address to check for (optional, defaults to connected wallet)"),
  })
  .strip()
  .describe("Instructions for checking how much can be claimed from a game");

export type CheckClaimableInput = z.infer<typeof CheckClaimableSchema>;
