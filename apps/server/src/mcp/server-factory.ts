import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { registerAllTools } from './tools.js';

const SERVER_NAME = 'osrs-mcp';
const SERVER_VERSION = '0.1.0';

const INSTRUCTIONS = `This server exposes OSRS player data tracked by the OSRS MCP RuneLite plugin for one login.
Every tool is scoped to whichever login authenticated this connection - there is no cross-login access.
Most logins track a single player: member_name is optional on every tool and defaults automatically
when this login has exactly one member. Only call list_members or pass member_name explicitly if this
login shares tracking across more than one player.
This server does not do gear recommendations, DPS calculations, or task-efficiency ranking - it only
exposes accurate, well-labeled current state (items by name and slot, Slayer task, kill counts, Combat
Achievement tiers, etc). Combining that with a goal (e.g. "best gear for X given items I own") is left to
your own OSRS domain knowledge.`;

/** One fresh McpServer per session, with `loginId` bound into every tool's closure at creation time. */
export function createMcpServerForLogin(db: Kysely<Database>, loginId: string): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
  registerAllTools(server, { db, loginId });
  return server;
}
