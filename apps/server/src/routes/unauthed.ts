import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { CreateLoginRequestSchema, validName } from '@osrs-mcp/shared';
import { tokenHash } from '../auth/index.js';
import { createLogin } from '../db/logins.js';
import type { RouteDeps } from './deps.js';
import { verifyCaptcha } from './captcha.js';
import { getGePricesJson } from './ge-price-cache.js';

export function registerUnauthedRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.post('/api/create-login', async (request, reply) => {
    const parsed = CreateLoginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body' });
    }
    const { login_name, captcha_response } = parsed.data;

    if (deps.config.hcaptcha.enabled) {
      const ok = await verifyCaptcha(captcha_response, deps.config.hcaptcha.secret);
      if (!ok) {
        return reply.code(400).send({ message: 'Captcha verification failed' });
      }
    }

    const trimmedName = login_name.trim();
    if (!validName(trimmedName)) {
      return reply.code(400).send({ message: 'Invalid login name' });
    }

    const token = randomUUID();
    const hash = tokenHash(token, deps.config.authSecret);
    await createLogin(deps.db, { name: trimmedName, tokenHash: hash });

    return reply.code(201).send({ login_name: trimmedName, token });
  });

  app.get('/api/captcha-enabled', async () => ({
    enabled: deps.config.hcaptcha.enabled,
    sitekey: deps.config.hcaptcha.sitekey,
  }));

  app.get('/api/ge-prices', async (_request, reply) => {
    reply.header('content-type', 'application/json');
    reply.header('cache-control', 'public, max-age=86400');
    return reply.send(getGePricesJson());
  });
}
