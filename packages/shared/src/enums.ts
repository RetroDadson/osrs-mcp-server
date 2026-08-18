import { z } from 'zod';
import { ACCOUNT_TYPES, CLUE_TIERS, CROP_STATES, ITEM_CONTAINERS, SLAYER_TASK_OUTCOMES } from './constants.js';

export const CropStateSchema = z.enum(CROP_STATES);
export type CropState = z.infer<typeof CropStateSchema>;

export const SlayerTaskOutcomeSchema = z.enum(SLAYER_TASK_OUTCOMES);
export type SlayerTaskOutcome = z.infer<typeof SlayerTaskOutcomeSchema>;

export const ClueTierSchema = z.enum(CLUE_TIERS);
export type ClueTier = z.infer<typeof ClueTierSchema>;

export const AccountTypeSchema = z.enum(ACCOUNT_TYPES);
export type AccountType = z.infer<typeof AccountTypeSchema>;

export const ItemContainerSchema = z.enum(ITEM_CONTAINERS);
export type ItemContainer = z.infer<typeof ItemContainerSchema>;
