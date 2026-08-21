import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  AmILoggedInResponseSchema,
  ClueCompletionSchema,
  DeathEventSchema,
  DEATH_KILLER_MAX_LENGTH,
  LoginUpdateSchema,
  RenameLoginSchema,
  SkillDataPeriodSchema,
  SlayerTaskCompletionSchema,
  SLAYER_TASK_FIELD_LIMITS,
  SNAPSHOT_PROP_LIMITS,
  validateSnapshotPropLength,
  validateOptionalStringLength,
  validName,
  type ValidationResult,
} from '@osrs-mcp/shared';
import { tokenHash } from '../auth/index.js';
import { renameLogin } from '../db/logins.js';
import { getLoginData } from '../db/login-data.js';
import { getSkillsForPeriod, type SkillsPeriodTable } from '../db/skills.js';
import { recordClueCompletion, recordDeath, recordSlayerTaskCompletion } from '../db/events.js';
import { toPendingUpdate } from './mappers.js';
import type { RouteDeps } from './deps.js';

function firstFailure(...results: ValidationResult[]): ValidationResult | undefined {
  return results.find((r) => !r.ok);
}

const SKILL_PERIOD_TABLE: Record<string, SkillsPeriodTable> = {
  Day: 'skills_day',
  // Preserved quirk from the prior server: Week has no dedicated bucket, it aliases to Month.
  Week: 'skills_month',
  Month: 'skills_month',
  Year: 'skills_year',
};

export function registerAuthedRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const loginId = (request: FastifyRequest): string => request.loginId!;
  const loginName = (request: FastifyRequest): string => request.loginName!;

  app.put('/api/rename', async (request, reply) => {
    const parsed = RenameLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body' });
    }
    const { new_name } = parsed.data;
    if (!validName(new_name)) {
      return reply.code(400).send({ message: 'Invalid name' });
    }
    await renameLogin(deps.db, loginId(request), new_name);
    // The auth cache holds the old loginName keyed by this token's hash - evict it so the new
    // name is visible immediately instead of only after the cache's TTL expires.
    deps.authCache.evict(tokenHash(request.headers.authorization!, deps.config.authSecret));
    return reply.code(200).send();
  });

  app.post('/api/update', async (request, reply) => {
    const parsed = LoginUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body' });
    }
    const update = parsed.data;

    const failure = firstFailure(
      ...Object.entries(SNAPSHOT_PROP_LIMITS).map(([prop, limits]) =>
        validateSnapshotPropLength(
          prop,
          (update as unknown as Record<string, unknown[] | undefined>)[prop],
          limits.min,
          limits.max,
          limits.format,
        ),
      ),
      validateOptionalStringLength('slayer_task.task', update.slayer_task?.task, SLAYER_TASK_FIELD_LIMITS.task),
      validateOptionalStringLength('slayer_task.master', update.slayer_task?.master, SLAYER_TASK_FIELD_LIMITS.master),
    );
    if (failure) {
      return reply.code(400).send({ message: failure.message });
    }

    deps.batcher.enqueue(toPendingUpdate(loginId(request), update));
    return reply.code(200).send();
  });

  app.post('/api/slayer-task-completed', async (request, reply) => {
    const parsed = SlayerTaskCompletionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body' });
    }
    const { task, master, amount_completed, outcome } = parsed.data;

    const failure = firstFailure(
      validateOptionalStringLength('task', task, SLAYER_TASK_FIELD_LIMITS.task),
      validateOptionalStringLength('master', master, SLAYER_TASK_FIELD_LIMITS.master),
    );
    if (failure) {
      return reply.code(400).send({ message: failure.message });
    }

    await recordSlayerTaskCompletion(deps.db, loginId(request), {
      task,
      master: master ?? null,
      amountCompleted: amount_completed,
      outcome,
    });
    return reply.code(201).send();
  });

  app.post('/api/clue-completed', async (request, reply) => {
    const parsed = ClueCompletionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body' });
    }
    const { tier } = parsed.data;

    await recordClueCompletion(deps.db, loginId(request), tier);
    return reply.code(201).send();
  });

  app.post('/api/death', async (request, reply) => {
    const parsed = DeathEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body' });
    }
    const { world_x, world_y, plane, killer } = parsed.data;
    const failure = validateOptionalStringLength('killer', killer, DEATH_KILLER_MAX_LENGTH);
    if (failure && !failure.ok) {
      return reply.code(400).send({ message: failure.message });
    }

    await recordDeath(deps.db, loginId(request), {
      worldX: world_x ?? null,
      worldY: world_y ?? null,
      plane: plane ?? null,
      killer: killer ?? null,
    });
    return reply.code(201).send();
  });

  app.get<{ Querystring: { from_time?: string } }>('/api/get-data', async (request, reply) => {
    const fromTime = request.query.from_time ? new Date(request.query.from_time) : new Date(0);
    if (Number.isNaN(fromTime.getTime())) {
      return reply.code(400).send({ message: 'Invalid from_time' });
    }
    const snapshot = await getLoginData(deps.db, loginId(request), fromTime);
    return reply.send(snapshot);
  });

  app.get<{ Querystring: { period?: string } }>('/api/get-skill-data', async (request, reply) => {
    const parsedPeriod = SkillDataPeriodSchema.safeParse(request.query.period);
    if (!parsedPeriod.success) {
      return reply.code(400).send({ message: 'Invalid period' });
    }
    const table = SKILL_PERIOD_TABLE[parsedPeriod.data]!;
    const data = await getSkillsForPeriod(deps.db, loginId(request), table);
    return reply.send(data);
  });

  app.get('/api/am-i-logged-in', async (request, reply) =>
    reply.code(200).send(AmILoggedInResponseSchema.parse({ login_name: loginName(request) })),
  );
}
