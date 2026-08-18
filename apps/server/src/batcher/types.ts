import type { FarmingPatch, Interacting, SlayerTask } from '@osrs-mcp/shared';

/**
 * Internal batcher representation of a partial member update - camelCase, decoupled from the
 * wire-format `GroupMemberUpdate` (snake_case). Every field but `groupId`/`name` is optional;
 * `undefined` means "unchanged", matching the wire contract's partial-update semantics.
 */
export interface PendingUpdate {
  groupId: string;
  name: string;
  stats: number[] | undefined;
  coordinates: number[] | undefined;
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

/** The 16 snapshot columns written by the bulk UPDATE (`group_id`/`member_name` are separate). */
export const BATCHED_COLUMNS = [
  'stats',
  'coordinates',
  'skills',
  'quests',
  'inventory',
  'equipment',
  'bank',
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
