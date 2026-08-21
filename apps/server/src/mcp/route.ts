import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createMcpAuthPreHandler, type AuthDeps } from '../auth/index.js';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { createMcpServerForLogin } from './server-factory.js';
import { McpSessionManager } from './session-manager.js';

const SESSION_HEADER = 'mcp-session-id';

async function handleMcpRequest(
  db: Kysely<Database>,
  sessions: McpSessionManager,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const sessionId = request.headers[SESSION_HEADER];
  const existing = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;

  reply.hijack();

  if (existing) {
    await existing.transport.handleRequest(request.raw, reply.raw, request.body);
    return;
  }

  // No existing session: only a POST carrying an `initialize` request may start a new one.
  if (request.method !== 'POST') {
    reply.raw.writeHead(400, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify({ error: 'No active MCP session for this request' }));
    return;
  }

  const server = createMcpServerForLogin(db, request.loginId!);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newSessionId) => {
      sessions.register(newSessionId, { server, transport });
    },
  });
  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId);
  };

  await server.connect(transport);
  await transport.handleRequest(request.raw, reply.raw, request.body);
}

export function registerMcpRoute(app: FastifyInstance, db: Kysely<Database>, authDeps: AuthDeps): void {
  const sessions = new McpSessionManager();
  const authPreHandler = createMcpAuthPreHandler(authDeps);

  const handler = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await handleMcpRequest(db, sessions, request, reply);
  };

  app.post('/mcp', { preHandler: authPreHandler }, handler);
  app.get('/mcp', { preHandler: authPreHandler }, handler);
  app.delete('/mcp', { preHandler: authPreHandler }, handler);
}
