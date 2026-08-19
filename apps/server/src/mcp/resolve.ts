import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { Member } from '@osrs-mcp/shared';
import { EQUIPMENT_SLOT_NAMES } from '@osrs-mcp/shared';
import { getLoginData } from '../db/login-data.js';
import { getItemMetadataBatch } from '../db/events.js';
import { getMemberId, listMembers } from '../db/logins.js';
import type { ToolContext } from './context.js';

const EPOCH = new Date(0);

function notFoundError(memberName: string): McpError {
  return new McpError(
    ErrorCode.InvalidParams,
    `No member named '${memberName}' for this login. Call list_members to see valid names.`,
  );
}

/**
 * `member_name` is optional on every tool - when omitted, a login with exactly one real member
 * (the common solo case) resolves automatically. A login with multiple members requires an
 * explicit `member_name`, since there's no way to know which one the caller means.
 */
async function resolveMemberName(ctx: ToolContext, memberName: string | undefined): Promise<string> {
  if (memberName !== undefined) return memberName;

  const members = await listMembers(ctx.db, ctx.loginId);
  if (members.length === 1) return members[0]!.name;

  if (members.length === 0) {
    throw new McpError(ErrorCode.InvalidParams, 'This login has no members yet.');
  }

  const names = members.map((m) => m.name).join(', ');
  throw new McpError(
    ErrorCode.InvalidParams,
    `This login has multiple members - pass member_name (options: ${names}) or call list_members.`,
  );
}

/** Always a full fetch (epoch cutoff) - MCP tools never use the plugin's incremental-poll optimization. */
export async function fetchMember(ctx: ToolContext, memberName: string | undefined): Promise<Member> {
  const resolvedName = await resolveMemberName(ctx, memberName);
  const members = await getLoginData(ctx.db, ctx.loginId, EPOCH);
  const member = members.find((m) => m.name.toLowerCase() === resolvedName.toLowerCase());
  if (!member) {
    throw notFoundError(resolvedName);
  }
  return member;
}

export async function resolveMemberId(ctx: ToolContext, memberName: string | undefined): Promise<string> {
  const resolvedName = await resolveMemberName(ctx, memberName);
  const memberId = await getMemberId(ctx.db, ctx.loginId, resolvedName);
  if (memberId === undefined) {
    throw notFoundError(resolvedName);
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
