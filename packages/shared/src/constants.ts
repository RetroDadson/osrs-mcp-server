/** RuneLite `Skill` enum order. Index into a flat skills XP array. Overall is never included. */
export const SKILL_NAMES = [
  'Attack',
  'Defence',
  'Strength',
  'Hitpoints',
  'Ranged',
  'Prayer',
  'Magic',
  'Cooking',
  'Woodcutting',
  'Fletching',
  'Fishing',
  'Firemaking',
  'Crafting',
  'Smithing',
  'Mining',
  'Herblore',
  'Agility',
  'Thieving',
  'Slayer',
  'Farming',
  'Runecraft',
  'Hunter',
  'Construction',
  'Sailing',
] as const;

/** Fixed 14-slot equipment ordering used to label raw equipment item-id/quantity pairs. */
export const EQUIPMENT_SLOT_NAMES = [
  'head',
  'cape',
  'amulet',
  'weapon',
  'body',
  'shield',
  'arms',
  'legs',
  'hair',
  'hands',
  'feet',
  'jaw',
  'ring',
  'ammo',
] as const;

export const CROP_STATES = ['growing', 'harvestable', 'diseased', 'dead', 'empty'] as const;

export const SLAYER_TASK_OUTCOMES = ['completed', 'skipped', 'cancelled', 'unknown'] as const;

export const CLUE_TIERS = ['beginner', 'easy', 'medium', 'hard', 'elite', 'master'] as const;

/**
 * Every OSRS game mode. The Group Ironman variants can only come from the plugin (read from the
 * in-game account-type varbit) - the OSRS Hiscores rank GIM players on the regular board.
 */
export const ACCOUNT_TYPES = [
  'hardcore_ironman',
  'ultimate',
  'ironman',
  'regular',
  'group_ironman',
  'hardcore_group_ironman',
  'unranked_group_ironman',
] as const;

export const ITEM_CONTAINERS = ['inventory', 'bank', 'equipment', 'seed_vault', 'shared_bank'] as const;
