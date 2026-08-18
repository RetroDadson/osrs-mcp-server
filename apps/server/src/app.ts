import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { createRestAuthPreHandler } from './auth/index.js';
import { GroupFullError } from './db/groups.js';
import { registerAuthedRoutes, registerUnauthedRoutes, type RouteDeps } from './routes/index.js';

const JSON_BODY_LIMIT_BYTES = 100_000;

export async function buildApp(deps: RouteDeps): Promise<FastifyInstance> {
  const app = Fastify({ bodyLimit: JSON_BODY_LIMIT_BYTES, logger: { level: deps.config.logLevel } });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Accept', 'Content-Type', 'Content-Length'],
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

  return app;
}
