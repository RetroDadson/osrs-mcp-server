import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tokenHash } from '../src/auth/index.js';
import { upsertHiscoreActivity, upsertItemMetadata } from '../src/db/events.js';
import { createGroup, getGroupIdByToken, getMemberId } from '../src/db/groups.js';
import { buildTestApp, closeTestApp, TEST_SECRET, type TestApp } from './helpers/test-app.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

const groupName = 'mcptest';
const token = 'mcp-test-token';

async function connectClient(port: number, authToken = token): Promise<Client> {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp/${groupName}`), {
    requestInit: { headers: { Authorization: authToken } },
  });
  await client.connect(transport);
  return client;
}

function firstTextContent(result: { content: Array<{ type: string; text?: string }> }): unknown {
  const text = result.content.find((c) => c.type === 'text')?.text;
  return text ? JSON.parse(text) : undefined;
}

describe('MCP server (real client over real HTTP)', () => {
  let testDb: TestDb;
  let testApp: TestApp;
  let port: number;
  let groupId: string;

  beforeAll(async () => {
    testDb = await startTestDb();
    await createGroup(testDb.db, {
      name: groupName,
      memberNames: ['alice', 'bob'],
      tokenHash: tokenHash(token, groupName, TEST_SECRET),
    });
    groupId = (await getGroupIdByToken(testDb.db, groupName, tokenHash(token, groupName, TEST_SECRET)))!;

    const aliceId = await getMemberId(testDb.db, groupId, 'alice');
    await upsertItemMetadata(testDb.db, {
      itemId: 4151,
      name: 'Abyssal whip',
      highAlch: 72000,
      lowAlch: 48000,
      tradeable: true,
      membersOnly: true,
    });
    await testDb.db
      .updateTable('members')
      .set({ inventory: [4151, 1, ...new Array(54).fill(0)] })
      .where('member_id', '=', aliceId!)
      .execute();
    await upsertHiscoreActivity(testDb.db, aliceId!, 'Zulrah', 250);
    await upsertHiscoreActivity(testDb.db, aliceId!, 'Clue Scrolls (easy)', 10);

    testApp = await buildTestApp(testDb);
    await testApp.app.listen({ port: 0, host: '127.0.0.1' });
    const address = testApp.app.server.address();
    port = typeof address === 'object' && address ? address.port : 0;
  }, 60_000);

  afterAll(async () => {
    await closeTestApp(testApp);
    await stopTestDb(testDb);
  });

  it('rejects a connection with no Authorization header', async () => {
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp/${groupName}`));
    await expect(client.connect(transport)).rejects.toThrow();
  });

  it('rejects a connection with the wrong token', async () => {
    await expect(connectClient(port, 'wrong-token')).rejects.toThrow();
  });

  it('lists every registered tool', async () => {
    const client = await connectClient(port);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'list_group_members',
        'get_member_status',
        'get_items',
        'get_skills',
        'get_quests',
        'get_slayer_task',
        'get_slayer_history',
        'get_kill_counts',
        'get_combat_achievements',
        'get_clue_totals',
        'get_clue_completion_history',
        'get_deaths',
        'get_farming_patches',
        'get_collection_log',
        'get_achievement_diary_progress',
      ]),
    );
    await client.close();
  });

  it('list_group_members returns the real members, not @SHARED', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'list_group_members', arguments: {} });
    const members = firstTextContent(result as never) as { name: string }[];
    expect(members.map((m) => m.name).sort()).toEqual(['alice', 'bob']);
    await client.close();
  });

  it('get_items resolves item names and alch values for a real container', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({
      name: 'get_items',
      arguments: { member_name: 'alice', container: 'inventory' },
    });
    const items = firstTextContent(result as never) as Array<{ item_id: number; name: string; high_alch: number }>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ item_id: 4151, name: 'Abyssal whip', high_alch: 72000 });
    await client.close();
  });

  it('get_items(shared_bank) resolves the @SHARED member\'s own bank, not an always-empty stub', async () => {
    const sharedId = await getMemberId(testDb.db, groupId, '@SHARED');
    await testDb.db.updateTable('members').set({ bank: [4151, 5] }).where('member_id', '=', sharedId!).execute();

    const client = await connectClient(port);
    const result = await client.callTool({
      name: 'get_items',
      arguments: { member_name: 'alice', container: 'shared_bank' },
    });
    const items = firstTextContent(result as never) as Array<{ item_id: number; quantity: number }>;
    expect(items).toEqual([expect.objectContaining({ item_id: 4151, quantity: 5 })]);
    await client.close();
  });

  it('get_kill_counts excludes clue scroll activities', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'get_kill_counts', arguments: { member_name: 'alice' } });
    const counts = firstTextContent(result as never) as Record<string, number>;
    expect(counts.Zulrah).toBe(250);
    expect(counts['Clue Scrolls (easy)']).toBeUndefined();
    await client.close();
  });

  it('get_clue_totals includes only clue scroll activities', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'get_clue_totals', arguments: { member_name: 'alice' } });
    const counts = firstTextContent(result as never) as Record<string, number>;
    expect(counts['Clue Scrolls (easy)']).toBe(10);
    expect(counts.Zulrah).toBeUndefined();
    await client.close();
  });

  it('returns a helpful tool error for an unknown member, naming list_group_members', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'get_skills', arguments: { member_name: 'nobody' } });
    expect(result.isError).toBe(true);
    await client.close();
  });

  it('does not leak data across groups (a second group cannot see this one\'s members)', async () => {
    await createGroup(testDb.db, { name: 'mcpother', memberNames: ['stranger'], tokenHash: tokenHash('other-token', 'mcpother', TEST_SECRET) });

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp/mcpother`), {
      requestInit: { headers: { Authorization: 'other-token' } },
    });
    await client.connect(transport);

    const result = await client.callTool({ name: 'list_group_members', arguments: {} });
    const members = firstTextContent(result as never) as { name: string }[];
    expect(members.map((m) => m.name)).toEqual(['stranger']);
    await client.close();
  });
});
