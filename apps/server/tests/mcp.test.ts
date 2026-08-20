import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tokenHash } from '../src/auth/index.js';
import {
  recordClueCompletion,
  recordDeath,
  recordSlayerTaskCompletion,
  upsertHiscoreActivity,
  upsertItemMetadata,
} from '../src/db/events.js';
import { createLogin, getLoginByTokenHash } from '../src/db/logins.js';
import { buildTestApp, closeTestApp, TEST_SECRET, type TestApp } from './helpers/test-app.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

const loginName = 'mcptest';
const token = 'mcp-test-token';

async function connectClient(port: number, authToken = token): Promise<Client> {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
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
  let loginId: string;

  beforeAll(async () => {
    testDb = await startTestDb();
    await createLogin(testDb.db, {
      name: loginName,
      tokenHash: tokenHash(token, TEST_SECRET),
    });
    loginId = (await getLoginByTokenHash(testDb.db, tokenHash(token, TEST_SECRET)))!.loginId;

    await upsertItemMetadata(testDb.db, {
      itemId: 4151,
      name: 'Abyssal whip',
      highAlch: 72000,
      lowAlch: 48000,
      tradeable: true,
      membersOnly: true,
    });
    await testDb.db
      .updateTable('logins')
      .set({ inventory: [4151, 1, ...new Array(54).fill(0)], bank: [] })
      .where('login_id', '=', loginId)
      .execute();
    await upsertHiscoreActivity(testDb.db, loginId, 'Zulrah', 250);
    await upsertHiscoreActivity(testDb.db, loginId, 'Clue Scrolls (easy)', 10);

    await testDb.db
      .updateTable('logins')
      .set({
        coordinates: [3200, 3200, 0],
        quests: Buffer.from([0, 1, 2]),
        shared_bank: [4151, 5],
        slayer_task: {
          task: 'Gargoyles',
          master: 'Duradel',
          amount_remaining: 5,
          initial_amount: 10,
          points: 2,
          task_streak: 1,
          wilderness_streak: 0,
        },
        combat_achievements: [1, 2, 3, 4, 5, 6],
        // farming_patches is a JSON ARRAY column - pg's default serialization treats plain JS
        // arrays as Postgres array literals, not JSON, so this needs an explicit jsonb cast
        // (the batcher's own write path already does this correctly via sql.ts's jsonbParam()).
        farming_patches: sql`${JSON.stringify([{ name: 'Herb patch (Falador)', raw_value: 0, state: 'empty' }])}::jsonb`,
        collection_log: [4151],
        diary_vars: new Array(62).fill(1),
      })
      .where('login_id', '=', loginId)
      .execute();

    await recordSlayerTaskCompletion(testDb.db, loginId, {
      task: 'Cows',
      master: null,
      amountCompleted: 50,
      outcome: 'completed',
    });
    await recordClueCompletion(testDb.db, loginId, 'easy');
    await recordDeath(testDb.db, loginId, { worldX: 3200, worldY: 3200, plane: 0, killer: 'Gargoyle' });

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
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
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
    expect(names).toHaveLength(14);
    await client.close();
  });

  it('get_items resolves item names and alch values for a real container', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'get_items', arguments: { container: 'inventory' } });
    const items = firstTextContent(result as never) as Array<{ item_id: number; name: string; high_alch: number }>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ item_id: 4151, name: 'Abyssal whip', high_alch: 72000 });
    await client.close();
  });

  it('get_items(shared_bank) resolves the shared_bank field off the same login row', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'get_items', arguments: { container: 'shared_bank' } });
    const items = firstTextContent(result as never) as Array<{ item_id: number; quantity: number }>;
    expect(items).toEqual([expect.objectContaining({ item_id: 4151, quantity: 5 })]);
    await client.close();
  });

  it('get_kill_counts excludes clue scroll activities', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'get_kill_counts', arguments: {} });
    const counts = firstTextContent(result as never) as Record<string, number>;
    expect(counts.Zulrah).toBe(250);
    expect(counts['Clue Scrolls (easy)']).toBeUndefined();
    await client.close();
  });

  it('get_clue_totals includes only clue scroll activities', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'get_clue_totals', arguments: {} });
    const counts = firstTextContent(result as never) as Record<string, number>;
    expect(counts['Clue Scrolls (easy)']).toBe(10);
    expect(counts.Zulrah).toBeUndefined();
    await client.close();
  });

  it('get_member_status returns a combined status snapshot', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'get_member_status', arguments: {} });
    const status = firstTextContent(result as never) as { name: string; coordinates: number[]; slayer_task: { task: string } };
    expect(status.name).toBe(loginName);
    expect(status.coordinates).toEqual([3200, 3200, 0]);
    expect(status.slayer_task.task).toBe('Gargoyles');
    await client.close();
  });

  it('get_quests returns the raw quest byte array', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'get_quests', arguments: {} });
    expect(firstTextContent(result as never)).toEqual([0, 1, 2]);
    await client.close();
  });

  it('get_slayer_task returns the current task snapshot', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'get_slayer_task', arguments: {} });
    expect(firstTextContent(result as never)).toMatchObject({ task: 'Gargoyles', master: 'Duradel' });
    await client.close();
  });

  it('get_slayer_history returns completed tasks, most recent first', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'get_slayer_history', arguments: {} });
    const history = firstTextContent(result as never) as Array<{ task: string }>;
    expect(history[0]?.task).toBe('Cows');
    await client.close();
  });

  it('get_combat_achievements returns the raw tier-count array', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'get_combat_achievements', arguments: {} });
    expect(firstTextContent(result as never)).toEqual([1, 2, 3, 4, 5, 6]);
    await client.close();
  });

  it('get_clue_completion_history returns timestamped completions', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'get_clue_completion_history', arguments: {} });
    const history = firstTextContent(result as never) as Array<{ tier: string }>;
    expect(history).toHaveLength(1);
    expect(history[0]?.tier).toBe('easy');
    await client.close();
  });

  it('get_deaths returns the death log', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'get_deaths', arguments: {} });
    const deaths = firstTextContent(result as never) as Array<{ killer: string }>;
    expect(deaths[0]?.killer).toBe('Gargoyle');
    await client.close();
  });

  it('get_farming_patches returns the raw per-slot state', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'get_farming_patches', arguments: {} });
    expect(firstTextContent(result as never)).toEqual([{ name: 'Herb patch (Falador)', raw_value: 0, state: 'empty' }]);
    await client.close();
  });

  it('get_collection_log resolves logged items to names', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'get_collection_log', arguments: {} });
    const items = firstTextContent(result as never) as Array<{ item_id: number; name: string }>;
    expect(items).toEqual([expect.objectContaining({ item_id: 4151, name: 'Abyssal whip' })]);
    await client.close();
  });

  it('get_achievement_diary_progress returns the raw diary_vars array', async () => {
    const client = await connectClient(port);
    const result = await client.callTool({ name: 'get_achievement_diary_progress', arguments: {} });
    expect(firstTextContent(result as never)).toEqual(new Array(62).fill(1));
    await client.close();
  });

  it('get_info reports server identity', async () => {
    const client = await connectClient(port);
    const info = client.getServerVersion();
    expect(info?.name).toBe('osrs-mcp');
    expect(client.getInstructions()).toBeTruthy();
    await client.close();
  });

  it("does not leak data across logins (a second login cannot see this one's data)", async () => {
    await createLogin(testDb.db, { name: 'mcpother', tokenHash: tokenHash('other-token', TEST_SECRET) });

    const client = await connectClient(port, 'other-token');
    const result = await client.callTool({ name: 'get_member_status', arguments: {} });
    const status = firstTextContent(result as never) as { name: string; coordinates: number[] | null };
    expect(status.name).toBe('mcpother');
    expect(status.coordinates).toBeNull();
    await client.close();
  });
});
