import { z } from 'zod';
import { ItemContainerSchema } from './enums.js';

const MEMBER_NAME_DESCRIPTION =
  'Member name. Optional if this login has only one member - omit it and the sole member is used automatically.';

export const MemberArgsSchema = z.object({
  member_name: z.string().optional().describe(MEMBER_NAME_DESCRIPTION),
});
export type MemberArgs = z.infer<typeof MemberArgsSchema>;

export const ItemsArgsSchema = z.object({
  member_name: z.string().optional().describe(MEMBER_NAME_DESCRIPTION),
  container: ItemContainerSchema.describe('Which item container to resolve.'),
});
export type ItemsArgs = z.infer<typeof ItemsArgsSchema>;

export const HistoryArgsSchema = z.object({
  member_name: z.string().optional().describe(MEMBER_NAME_DESCRIPTION),
  limit: z.number().int().positive().optional().describe('Max rows to return, most recent first. Defaults to 20.'),
});
export type HistoryArgs = z.infer<typeof HistoryArgsSchema>;

export const ClueTotalsArgsSchema = z.object({
  member_name: z.string().optional().describe(MEMBER_NAME_DESCRIPTION),
  tier: z.string().optional().describe('Optional case-insensitive substring filter on the clue tier name.'),
});
export type ClueTotalsArgs = z.infer<typeof ClueTotalsArgsSchema>;

export const KillCountArgsSchema = z.object({
  member_name: z.string().optional().describe(MEMBER_NAME_DESCRIPTION),
  boss: z.string().optional().describe('Optional exact (case-insensitive) boss/activity name filter.'),
});
export type KillCountArgs = z.infer<typeof KillCountArgsSchema>;

export const MemberSummarySchema = z.object({
  name: z.string(),
  account_type: z.string().nullable(),
});
export type MemberSummary = z.infer<typeof MemberSummarySchema>;
