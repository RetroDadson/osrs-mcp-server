import { z } from 'zod';
import { ItemContainerSchema } from './enums.js';

export const ItemsArgsSchema = z.object({
  container: ItemContainerSchema.describe('Which item container to resolve.'),
});
export type ItemsArgs = z.infer<typeof ItemsArgsSchema>;

export const HistoryArgsSchema = z.object({
  limit: z.number().int().positive().optional().describe('Max rows to return, most recent first. Defaults to 20.'),
});
export type HistoryArgs = z.infer<typeof HistoryArgsSchema>;

export const ClueTotalsArgsSchema = z.object({
  tier: z.string().optional().describe('Optional case-insensitive substring filter on the clue tier name.'),
});
export type ClueTotalsArgs = z.infer<typeof ClueTotalsArgsSchema>;

export const KillCountArgsSchema = z.object({
  boss: z.string().optional().describe('Optional exact (case-insensitive) boss/activity name filter.'),
});
export type KillCountArgs = z.infer<typeof KillCountArgsSchema>;
