import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { createRestAuthPreHandler } from './auth/index.js';
import { GroupFullError } from './db/groups.js';
import { registerMcpRoute } from './mcp/index.js';
import { registerAuthedRoutes, registerUnauthedRoutes, type RouteDeps } from './routes/index.js';

const JSON_BODY_LIMIT_BYTES = 100_000;

// `apps/server/src/app.ts` (dev, via tsx) and `apps/server/dist/app.js` (prod, built) sit at the
// same depth inside `apps/server/`, so this relative path resolves to `apps/client/dist` either way.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST_PATH = path.resolve(__dirname, '../../client/dist');

export async function buildApp(deps: RouteDeps): Promise<FastifyInstance> {
  const app = Fastify({ bodyLimit: JSON_BODY_LIMIT_BYTES, logger: { level: deps.config.logLevel } });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Accept', 'Content-Type', 'Content-Length', 'Mcp-Session-Id', 'Mcp-Protocol-Version'],
    exposedHeaders: ['Mcp-Session-Id'],
    maxAge: 3600,
  });

  // Must be registered before any child plugin/encapsulated route group below - Fastify only
  // wires an error handler into a child context if it existed at the time that child was
  // registered, not lazily at `ready()` time.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof GroupFullError) {
      reply.code(400).send({ message: error.message });
      return;
    }
    // Every other error (DB failures, unexpected exceptions) gets a bare 500 - full detail only
    // in the server log, never in the response body.
    request.log.error(error);
    reply.code(500).send();
  });

  app.get('/health', async () => ({ status: 'ok' }));

  registerUnauthedRoutes(app, deps);

  const authDeps = { db: deps.db, cache: deps.authCache, secret: deps.config.authSecret };
  await app.register(async (authedScope) => {
    authedScope.addHook('preHandler', createRestAuthPreHandler(authDeps));
    registerAuthedRoutes(authedScope, deps);
  });

  registerMcpRoute(app, deps.db, authDeps);

  // Serves the built React client from the same process/port as the API and MCP server. Only
  // registered when a build actually exists - keeps `apps/server` runnable standalone (its own
  // tests never build the client) without erroring on a missing directory.
  if (existsSync(CLIENT_DIST_PATH)) {
    await app.register(fastifyStatic, { root: CLIENT_DIST_PATH });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api') && !request.url.startsWith('/mcp')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send();
    });
  }

  return app;
}
