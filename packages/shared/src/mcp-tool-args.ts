import { z } from 'zod';
import { ItemContainerSchema } from './enums.js';

export const MemberArgsSchema = z.object({
  member_name: z.string().describe('The exact member name as returned by list_group_members.'),
});
export type MemberArgs = z.infer<typeof MemberArgsSchema>;

export const ItemsArgsSchema = z.object({
  member_name: z.string().describe('The exact member name as returned by list_group_members.'),
  container: ItemContainerSchema.describe('Which item container to resolve.'),
});
export type ItemsArgs = z.infer<typeof ItemsArgsSchema>;

export const HistoryArgsSchema = z.object({
  member_name: z.string().describe('The exact member name as returned by list_group_members.'),
  limit: z.number().int().positive().optional().describe('Max rows to return, most recent first. Defaults to 20.'),
});
export type HistoryArgs = z.infer<typeof HistoryArgsSchema>;

export const ClueTotalsArgsSchema = z.object({
  member_name: z.string().describe('The exact member name as returned by list_group_members.'),
  tier: z.string().optional().describe('Optional case-insensitive substring filter on the clue tier name.'),
});
export type ClueTotalsArgs = z.infer<typeof ClueTotalsArgsSchema>;

export const KillCountArgsSchema = z.object({
  member_name: z.string().describe('The exact member name as returned by list_group_members.'),
  boss: z.string().optional().describe('Optional exact (case-insensitive) boss/activity name filter.'),
});
export type KillCountArgs = z.infer<typeof KillCountArgsSchema>;

export const GroupMemberSummarySchema = z.object({
  name: z.string(),
  account_type: z.string().nullable(),
});
export type GroupMemberSummary = z.infer<typeof GroupMemberSummarySchema>;
