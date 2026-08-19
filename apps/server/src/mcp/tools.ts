import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  ClueTotalsArgsSchema,
  HistoryArgsSchema,
  ItemsArgsSchema,
  KillCountArgsSchema,
  MemberArgsSchema,
  SHARED_MEMBER,
  SKILL_NAMES,
} from '@osrs-mcp/shared';
import { getClueCompletions, getDeaths, getHiscoreActivities, getSlayerTaskHistory } from '../db/events.js';
import { listMembers } from '../db/logins.js';
import type { ToolContext } from './context.js';
import { EQUIPMENT_SLOT_NAMES, fetchMember, resolveFlatItems, resolveMemberId } from './resolve.js';

const DEFAULT_HISTORY_LIMIT = 20;
const CLUE_ACTIVITY_PREFIX = 'Clue Scrolls';

function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_members',
    {
      description:
        'Lists every real member of this login (excluding the internal shared-bank placeholder) along with their detected OSRS account type. Only needed when this login has more than one member - solo logins don\'t need to call this first, every other tool defaults member_name automatically.',
    },
    async () => {
      const members = await listMembers(ctx.db, ctx.loginId);
      return jsonResult(members.map((m) => ({ name: m.name, account_type: m.accountType })));
    },
  );

  server.registerTool(
    'get_member_status',
    {
      description:
        "Current snapshot of what a member is doing right now: stats, location, current interaction target, account type, and active Slayer task. Omit member_name if this login only has one member.",
      inputSchema: MemberArgsSchema.shape,
    },
    async ({ member_name }) => {
      const member = await fetchMember(ctx, member_name);
      return jsonResult({
        name: member.name,
        account_type: member.account_type ?? null,
        stats: member.stats ?? null,
        coordinates: member.coordinates ?? null,
        interacting: member.interacting ?? null,
        slayer_task: member.slayer_task ?? null,
        last_updated: member.last_updated ?? null,
      });
    },
  );

  server.registerTool(
    'get_items',
    {
      description:
        'Resolves a member\'s items in a given container (inventory, bank, equipment, seed_vault, or shared_bank) to item names, quantities, and alch values. Equipment entries are labeled with their slot name. Omit member_name if this login only has one member.',
      inputSchema: ItemsArgsSchema.shape,
    },
    async ({ member_name, container }) => {
      if (container === 'shared_bank') {
        const shared = await fetchMember(ctx, SHARED_MEMBER);
        return jsonResult(await resolveFlatItems(ctx, shared.bank));
      }

      const member = await fetchMember(ctx, member_name);
      const flat = member[container];

      const slotNames = container === 'equipment' ? EQUIPMENT_SLOT_NAMES : undefined;
      return jsonResult(await resolveFlatItems(ctx, flat, slotNames));
    },
  );

  server.registerTool(
    'get_skills',
    {
      description: "Member's current skill levels/XP, keyed by skill name. Omit member_name if this login only has one member.",
      inputSchema: MemberArgsSchema.shape,
    },
    async ({ member_name }) => {
      const member = await fetchMember(ctx, member_name);
      const xp = member.skills ?? [];
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
      description: 'Raw quest-state byte array for a member. Not decoded into quest names/stages. Omit member_name if this login only has one member.',
      inputSchema: MemberArgsSchema.shape,
    },
    async ({ member_name }) => jsonResult((await fetchMember(ctx, member_name)).quests ?? null),
  );

  server.registerTool(
    'get_slayer_task',
    {
      description:
        "Member's current Slayer task snapshot (task name, master, progress, points, streaks), or null if none active. Omit member_name if this login only has one member.",
      inputSchema: MemberArgsSchema.shape,
    },
    async ({ member_name }) => jsonResult((await fetchMember(ctx, member_name)).slayer_task ?? null),
  );

  server.registerTool(
    'get_slayer_history',
    {
      description:
        'Completed Slayer tasks, most recent first. Only covers tasks completed while the plugin was connected - a gap in coverage during downtime is possible. Omit member_name if this login only has one member.',
      inputSchema: HistoryArgsSchema.shape,
    },
    async ({ member_name, limit }) => {
      const memberId = await resolveMemberId(ctx, member_name);
      const history = await getSlayerTaskHistory(ctx.db, memberId, limit ?? DEFAULT_HISTORY_LIMIT);
      return jsonResult(history);
    },
  );

  server.registerTool(
    'get_kill_counts',
    {
      description:
        "Boss/activity kill counts from the OSRS Hiscores (authoritative, but bosses only rank after 5 kills - expect 0 until then). Excludes clue scroll counts; use get_clue_totals for those. Omit member_name if this login only has one member.",
      inputSchema: KillCountArgsSchema.shape,
    },
    async ({ member_name, boss }) => {
      const memberId = await resolveMemberId(ctx, member_name);
      const activities = await getHiscoreActivities(ctx.db, memberId);
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
      description: 'Combat Achievement tier-completion counts: [easy, medium, hard, elite, master, grandmaster]. Omit member_name if this login only has one member.',
      inputSchema: MemberArgsSchema.shape,
    },
    async ({ member_name }) => jsonResult((await fetchMember(ctx, member_name)).combat_achievements ?? null),
  );

  server.registerTool(
    'get_clue_totals',
    {
      description:
        'Clue scroll completion totals per tier from the OSRS Hiscores (authoritative, gap-resilient - reconciled independently of plugin uptime). Omit member_name if this login only has one member.',
      inputSchema: ClueTotalsArgsSchema.shape,
    },
    async ({ member_name, tier }) => {
      const memberId = await resolveMemberId(ctx, member_name);
      const activities = await getHiscoreActivities(ctx.db, memberId);
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
        'Timestamped clue scroll completions, most recent first. Best-effort/plugin-uptime-gapped (unlike get_clue_totals) - use this for "when" questions, get_clue_totals for authoritative counts. Omit member_name if this login only has one member.',
      inputSchema: HistoryArgsSchema.shape,
    },
    async ({ member_name, limit }) => {
      const memberId = await resolveMemberId(ctx, member_name);
      const history = await getClueCompletions(ctx.db, memberId, undefined, limit ?? DEFAULT_HISTORY_LIMIT);
      return jsonResult(history);
    },
  );

  server.registerTool(
    'get_deaths',
    {
      description:
        "Member's death log, most recent first. Best-effort only (no authoritative external source) - only captures deaths observed while the plugin was connected. Omit member_name if this login only has one member.",
      inputSchema: HistoryArgsSchema.shape,
    },
    async ({ member_name, limit }) => {
      const memberId = await resolveMemberId(ctx, member_name);
      const deaths = await getDeaths(ctx.db, memberId, limit ?? DEFAULT_HISTORY_LIMIT);
      return jsonResult(deaths);
    },
  );

  server.registerTool(
    'get_farming_patches',
    {
      description:
        "Member's tracked farming patch states. Only distinguishes empty vs. occupied (raw_value) - growth stage isn't decoded since it depends on crop type, which isn't tracked. Omit member_name if this login only has one member.",
      inputSchema: MemberArgsSchema.shape,
    },
    async ({ member_name }) => jsonResult((await fetchMember(ctx, member_name)).farming_patches ?? null),
  );

  server.registerTool(
    'get_collection_log',
    {
      description: "Member's collection log entries, resolved to item names. Omit member_name if this login only has one member.",
      inputSchema: MemberArgsSchema.shape,
    },
    async ({ member_name }) => {
      const member = await fetchMember(ctx, member_name);
      const itemIds = member.collection_log_v2 ?? [];
      const asPairs = itemIds.flatMap((id) => [id, 1]);
      return jsonResult(await resolveFlatItems(ctx, asPairs));
    },
  );

  server.registerTool(
    'get_achievement_diary_progress',
    {
      description: 'Raw achievement diary progress values for a member. Not decoded into diary names/tiers. Omit member_name if this login only has one member.',
      inputSchema: MemberArgsSchema.shape,
    },
    async ({ member_name }) => jsonResult((await fetchMember(ctx, member_name)).diary_vars ?? null),
  );
}
