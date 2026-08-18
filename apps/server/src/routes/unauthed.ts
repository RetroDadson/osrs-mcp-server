import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { CreateGroupRequestSchema, validName } from '@osrs-mcp/shared';
import { tokenHash } from '../auth/index.js';
import { createGroup, MAX_MEMBERS_PER_GROUP } from '../db/groups.js';
import type { RouteDeps } from './deps.js';
import { verifyCaptcha } from './captcha.js';
import { getGePricesJson } from './ge-price-cache.js';

export function registerUnauthedRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.post('/api/create-group', async (request, reply) => {
    const parsed = CreateGroupRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body' });
    }
    const { name, member_names, captcha_response } = parsed.data;

    if (deps.config.hcaptcha.enabled) {
      const ok = await verifyCaptcha(captcha_response, deps.config.hcaptcha.secret);
      if (!ok) {
        return reply.code(400).send({ message: 'Captcha verification failed' });
      }
    }

    if (member_names.length > MAX_MEMBERS_PER_GROUP) {
      return reply.code(400).send({ message: `A group may have at most ${MAX_MEMBERS_PER_GROUP} members` });
    }

    const trimmedName = name.trim();
    if (!validName(trimmedName)) {
      return reply.code(400).send({ message: 'Invalid group name' });
    }

    const filteredMemberNames = member_names.filter((m) => m.trim() !== '');
    for (const memberName of filteredMemberNames) {
      if (!validName(memberName)) {
        return reply.code(400).send({ message: `Invalid member name: ${memberName}` });
      }
    }

    const token = randomUUID();
    const hash = tokenHash(token, trimmedName, deps.config.authSecret);
    await createGroup(deps.db, { name: trimmedName, memberNames: filteredMemberNames, tokenHash: hash });

    return reply.code(201).send({ name: trimmedName, member_names: filteredMemberNames, token });
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
