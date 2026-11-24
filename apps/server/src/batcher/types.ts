import type { FarmingPatch, Interacting, SlayerTask } from '@osrs-mcp/shared';

/**
 * Internal batcher representation of a partial login update - camelCase, decoupled from the
 * wire-format `LoginUpdate` (snake_case). Every field but `loginId` is optional; `undefined`
 * means "unchanged", matching the wire contract's partial-update semantics.
 */
export interface PendingUpdate {
  loginId: string;
  stats: number[] | undefined;
  skills: number[] | undefined;
  quests: number[] | undefined;
  inventory: number[] | undefined;
  equipment: number[] | undefined;
  bank: number[] | undefined;
  sharedBank: number[] | undefined;
  runePouch: number[] | undefined;
  interacting: Interacting | undefined;
  seedVault: number[] | undefined;
  deposited: number[] | undefined;
  diaryVars: number[] | undefined;
  collectionLogV2: number[] | undefined;
  potionStorage: number[] | undefined;
  slayerTask: SlayerTask | undefined;
  combatAchievements: number[] | undefined;
  farmingPatches: FarmingPatch[] | undefined;
  lastUpdated: string | undefined;
}

/** The 17 snapshot columns written by the bulk UPDATE (`login_id` is separate). */
export const BATCHED_COLUMNS = [
  'stats',
  'skills',
  'quests',
  'inventory',
  'equipment',
  'bank',
  'shared_bank',
  'rune_pouch',
  'interacting',
  'seed_vault',
  'diary_vars',
  'collection_log',
  'potion_storage',
  'slayer_task',
  'combat_achievements',
  'farming_patches',
] as const;
