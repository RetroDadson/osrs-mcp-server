import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ClueTotalsArgsSchema, HistoryArgsSchema, ItemsArgsSchema, KillCountArgsSchema, SKILL_NAMES } from '@osrs-mcp/shared';
import { getClueCompletions, getDeaths, getHiscoreActivities, getSlayerTaskHistory } from '../db/events.js';
import type { ToolContext } from './context.js';
import { EQUIPMENT_SLOT_NAMES, fetchLoginSnapshot, resolveFlatItems } from './resolve.js';

const DEFAULT_HISTORY_LIMIT = 20;
const CLUE_ACTIVITY_PREFIX = 'Clue Scrolls';

function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'get_status',
    {
      description:
        'Current snapshot of what this login is doing right now: stats (hitpoints, prayer and run energy as [current, max] pairs), current interaction target (name and health), account type, and active Slayer task. The player\'s location and world are deliberately not tracked. account_type is one of regular, ironman, hardcore_ironman, ultimate, group_ironman, hardcore_group_ironman, or unranked_group_ironman - every non-regular mode is an ironman (no Grand Exchange or trading outside the group), and group modes share items with teammates via group storage (shared_bank).',
    },
    async () => {
      const snapshot = await fetchLoginSnapshot(ctx);
      return jsonResult({
        name: snapshot.name,
        account_type: snapshot.account_type ?? null,
        stats: snapshot.stats ?? null,
        interacting: snapshot.interacting ?? null,
        slayer_task: snapshot.slayer_task ?? null,
        last_updated: snapshot.last_updated ?? null,
      });
    },
  );

  server.registerTool(
    'get_items',
    {
      description:
        "Resolves items in a given container (inventory, bank, equipment, seed_vault, shared_bank, or quiver) to item names, quantities, and alch values. Equipment entries are labeled with their slot name. quiver is the ammo stack held in Dizana's quiver (empty if none).",
      inputSchema: ItemsArgsSchema.shape,
    },
    async ({ container }) => {
      const snapshot = await fetchLoginSnapshot(ctx);
      const flat = snapshot[container];

      const slotNames = container === 'equipment' ? EQUIPMENT_SLOT_NAMES : undefined;
      return jsonResult(await resolveFlatItems(ctx, flat, slotNames));
    },
  );

  server.registerTool(
    'get_skills',
    {
      description: 'Current skill levels/XP, keyed by skill name.',
    },
    async () => {
      const snapshot = await fetchLoginSnapshot(ctx);
      const xp = snapshot.skills ?? [];
      const result: Record<string, number> = {};
      SKILL_NAMES.forEach((skillName, index) => {
        const value = xp[index];
        if (value !== undefined) result[skillName] = value;
      });
      return jsonResult(result);
    },
  );

  server.registerTool(
    'get_quests',
    {
      description: 'Raw quest-state byte array. Not decoded into quest names/stages.',
    },
    async () => jsonResult((await fetchLoginSnapshot(ctx)).quests ?? null),
  );

  server.registerTool(
    'get_slayer_task',
    {
      description: 'Current Slayer task snapshot (task name, master, progress, points, streaks), or null if none active.',
    },
    async () => jsonResult((await fetchLoginSnapshot(ctx)).slayer_task ?? null),
  );

  server.registerTool(
    'get_slayer_history',
    {
      description:
        'Completed Slayer tasks, most recent first. Only covers tasks completed while the plugin was connected - a gap in coverage during downtime is possible.',
      inputSchema: HistoryArgsSchema.shape,
    },
    async ({ limit }) => {
      const history = await getSlayerTaskHistory(ctx.db, ctx.loginId, limit ?? DEFAULT_HISTORY_LIMIT);
      return jsonResult(history);
    },
  );

  server.registerTool(
    'get_kill_counts',
    {
      description:
        'Boss/activity kill counts from the OSRS Hiscores (authoritative, but bosses only rank after 5 kills - expect 0 until then). Excludes clue scroll counts; use get_clue_totals for those.',
      inputSchema: KillCountArgsSchema.shape,
    },
    async ({ boss }) => {
      const activities = await getHiscoreActivities(ctx.db, ctx.loginId);
      const result: Record<string, number> = {};
      for (const [name, score] of Object.entries(activities)) {
        if (name.startsWith(CLUE_ACTIVITY_PREFIX)) continue;
        if (boss && name.toLowerCase() !== boss.toLowerCase()) continue;
        result[name] = score;
      }
      return jsonResult(result);
    },
  );

  server.registerTool(
    'get_combat_achievements',
    {
      description: 'Combat Achievement tier-completion counts: [easy, medium, hard, elite, master, grandmaster].',
    },
    async () => jsonResult((await fetchLoginSnapshot(ctx)).combat_achievements ?? null),
  );

  server.registerTool(
    'get_clue_totals',
    {
      description:
        'Clue scroll completion totals per tier from the OSRS Hiscores (authoritative, gap-resilient - reconciled independently of plugin uptime).',
      inputSchema: ClueTotalsArgsSchema.shape,
    },
    async ({ tier }) => {
      const activities = await getHiscoreActivities(ctx.db, ctx.loginId);
      const result: Record<string, number> = {};
      for (const [name, score] of Object.entries(activities)) {
        if (!name.startsWith(CLUE_ACTIVITY_PREFIX)) continue;
        if (tier && !name.toLowerCase().includes(tier.toLowerCase())) continue;
        result[name] = score;
      }
      return jsonResult(result);
    },
  );

  server.registerTool(
    'get_clue_completion_history',
    {
      description:
        'Timestamped clue scroll completions, most recent first. Best-effort/plugin-uptime-gapped (unlike get_clue_totals) - use this for "when" questions, get_clue_totals for authoritative counts.',
      inputSchema: HistoryArgsSchema.shape,
    },
    async ({ limit }) => {
      const history = await getClueCompletions(ctx.db, ctx.loginId, undefined, limit ?? DEFAULT_HISTORY_LIMIT);
      return jsonResult(history);
    },
  );

  server.registerTool(
    'get_deaths',
    {
      description:
        'Death log (time and likely killer), most recent first. Best-effort only (no authoritative external source) - only captures deaths observed while the plugin was connected. Death locations are deliberately not tracked.',
      inputSchema: HistoryArgsSchema.shape,
    },
    async ({ limit }) => {
      const deaths = await getDeaths(ctx.db, ctx.loginId, limit ?? DEFAULT_HISTORY_LIMIT);
      return jsonResult(deaths);
    },
  );

  server.registerTool(
    'get_farming_patches',
    {
      description:
        "Tracked farming patch states. Only distinguishes empty vs. occupied (raw_value) - growth stage isn't decoded since it depends on crop type, which isn't tracked.",
    },
    async () => jsonResult((await fetchLoginSnapshot(ctx)).farming_patches ?? null),
  );

  server.registerTool(
    'get_collection_log',
    {
      description: 'Collection log entries, resolved to item names.',
    },
    async () => {
      const snapshot = await fetchLoginSnapshot(ctx);
      const itemIds = snapshot.collection_log_v2 ?? [];
      const asPairs = itemIds.flatMap((id) => [id, 1]);
      return jsonResult(await resolveFlatItems(ctx, asPairs));
    },
  );

  server.registerTool(
    'get_achievement_diary_progress',
    {
      description: 'Raw achievement diary progress values. Not decoded into diary names/tiers.',
    },
    async () => jsonResult((await fetchLoginSnapshot(ctx)).diary_vars ?? null),
  );
}
