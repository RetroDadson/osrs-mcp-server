import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { GroupMember } from '@osrs-mcp/shared';
import { EQUIPMENT_SLOT_NAMES } from '@osrs-mcp/shared';
import { getGroupData } from '../db/group-data.js';
import { getItemMetadataBatch } from '../db/events.js';
import { getMemberId } from '../db/groups.js';
import type { ToolContext } from './context.js';

const EPOCH = new Date(0);

function notFoundError(memberName: string): McpError {
  return new McpError(
    ErrorCode.InvalidParams,
    `No member named '${memberName}' in this group. Call list_group_members to see valid names.`,
  );
}

/** Always a full fetch (epoch cutoff) - MCP tools never use the plugin's incremental-poll optimization. */
export async function fetchMember(ctx: ToolContext, memberName: string): Promise<GroupMember> {
  const members = await getGroupData(ctx.db, ctx.groupId, EPOCH);
  const member = members.find((m) => m.name.toLowerCase() === memberName.toLowerCase());
  if (!member) {
    throw notFoundError(memberName);
  }
  return member;
}

export async function resolveMemberId(ctx: ToolContext, memberName: string): Promise<string> {
  const memberId = await getMemberId(ctx.db, ctx.groupId, memberName);
  if (memberId === undefined) {
    throw notFoundError(memberName);
  }
  return memberId;
}

export interface ResolvedItem {
  item_id: number;
  name: string | null;
  quantity: number;
  slot: string | null;
  high_alch: number | null;
  low_alch: number | null;
}

/**
 * Parses a flat `[itemId, quantity, itemId, quantity, ...]` array (dropping empty `itemId === 0`
 * slots), resolves names/alch values via `item_metadata`, and - for equipment - labels each
 * entry with its fixed slot name by pair index.
 */
export async function resolveFlatItems(
  ctx: ToolContext,
  flat: number[] | undefined,
  slotNames?: readonly string[],
): Promise<ResolvedItem[]> {
  if (!flat) return [];

  const pairs: { itemId: number; quantity: number; slotIndex: number }[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const itemId = flat[i]!;
    const quantity = flat[i + 1]!;
    if (itemId === 0) continue;
    pairs.push({ itemId, quantity, slotIndex: i / 2 });
  }

  const metadata = await getItemMetadataBatch(
    ctx.db,
    pairs.map((p) => p.itemId),
  );

  return pairs.map((pair) => {
    const meta = metadata.get(pair.itemId);
    return {
      item_id: pair.itemId,
      name: meta?.name ?? null,
      quantity: pair.quantity,
      slot: slotNames ? (slotNames[pair.slotIndex] ?? null) : null,
      high_alch: meta?.highAlch ?? null,
      low_alch: meta?.lowAlch ?? null,
    };
  });
}

export { EQUIPMENT_SLOT_NAMES };
