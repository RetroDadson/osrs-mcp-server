import type { LoginUpdate } from '@osrs-mcp/shared';
import type { PendingUpdate } from '../batcher/index.js';

export function toPendingUpdate(loginId: string, update: LoginUpdate): PendingUpdate {
  return {
    loginId,
    stats: update.stats,
    skills: update.skills,
    quests: update.quests,
    inventory: update.inventory,
    equipment: update.equipment,
    bank: update.bank,
    sharedBank: update.shared_bank,
    runePouch: update.rune_pouch,
    interacting: update.interacting,
    seedVault: update.seed_vault,
    deposited: update.deposited,
    diaryVars: update.diary_vars,
    collectionLogV2: update.collection_log_v2,
    potionStorage: update.potion_storage,
    slayerTask: update.slayer_task,
    combatAchievements: update.combat_achievements,
    farmingPatches: update.farming_patches,
    lastUpdated: update.last_updated,
  };
}
