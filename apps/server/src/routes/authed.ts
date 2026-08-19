import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  ClueCompletionSchema,
  DeathEventSchema,
  DEATH_KILLER_MAX_LENGTH,
  MemberUpdateSchema,
  MEMBER_PROP_LIMITS,
  RenameMemberSchema,
  SHARED_MEMBER,
  SkillDataPeriodSchema,
  SlayerTaskCompletionSchema,
  SLAYER_TASK_FIELD_LIMITS,
  validateMemberPropLength,
  validateOptionalStringLength,
  validName,
  type ValidationResult,
} from '@osrs-mcp/shared';
import {
  addMember,
  deleteMember,
  getMemberId,
  isMemberPresent,
  renameMember,
} from '../db/logins.js';
import { getLoginData } from '../db/login-data.js';
import { getSkillsForPeriod, type SkillsPeriodTable } from '../db/skills.js';
import { recordClueCompletion, recordDeath, recordSlayerTaskCompletion } from '../db/events.js';
import { toPendingUpdate } from './mappers.js';
import type { RouteDeps } from './deps.js';

interface LoginNameParams {
  loginName: string;
}

function isSharedMember(name: string): boolean {
  return name.toLowerCase() === SHARED_MEMBER.toLowerCase();
}

async function requireMemberId(
  deps: RouteDeps,
  loginId: string,
  memberName: string,
): Promise<string> {
  const memberId = await getMemberId(deps.db, loginId, memberName);
  if (memberId === undefined) {
    throw new Error(`No member named "${memberName}" for login ${loginId}`);
  }
  return memberId;
}

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

  app.post<{ Params: LoginNameParams; Body: { name?: string } }>(
    '/api/login/:loginName/add-member',
    async (request, reply) => {
      const name = request.body?.name;
      if (!name || isSharedMember(name) || !validName(name)) {
        return reply.code(400).send({ message: 'Invalid member name' });
      }
      await addMember(deps.db, loginId(request), name);
      return reply.code(201).send();
    },
  );

  app.delete<{ Params: LoginNameParams; Body: { name?: string } }>(
    '/api/login/:loginName/delete-member',
    async (request, reply) => {
      const name = request.body?.name;
      if (!name || isSharedMember(name)) {
        return reply.code(400).send({ message: 'Invalid member name' });
      }
      await deleteMember(deps.db, loginId(request), name);
      return reply.code(200).send();
    },
  );

  app.put<{ Params: LoginNameParams }>('/api/login/:loginName/rename-member', async (request, reply) => {
    const parsed = RenameMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body' });
    }
    const { original_name, new_name } = parsed.data;
    if (isSharedMember(original_name) || isSharedMember(new_name) || !validName(new_name)) {
      return reply.code(400).send({ message: 'Invalid member name' });
    }
    await renameMember(deps.db, loginId(request), original_name, new_name);
    return reply.code(200).send();
  });

  app.post<{ Params: LoginNameParams }>('/api/login/:loginName/update-member', async (request, reply) => {
    const parsed = MemberUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body' });
    }
    const update = parsed.data;

    if (isSharedMember(update.name)) {
      return reply.code(400).send({ message: 'Invalid member name' });
    }

    const failure = firstFailure(
      ...Object.entries(MEMBER_PROP_LIMITS).map(([prop, limits]) =>
        validateMemberPropLength(
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

  app.post<{ Params: LoginNameParams }>('/api/login/:loginName/slayer-task-completed', async (request, reply) => {
    const parsed = SlayerTaskCompletionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body' });
    }
    const { name, task, master, amount_completed, outcome } = parsed.data;

    if (isSharedMember(name)) {
      return reply.code(400).send({ message: 'Invalid member name' });
    }
    const failure = firstFailure(
      validateOptionalStringLength('task', task, SLAYER_TASK_FIELD_LIMITS.task),
      validateOptionalStringLength('master', master, SLAYER_TASK_FIELD_LIMITS.master),
    );
    if (failure) {
      return reply.code(400).send({ message: failure.message });
    }

    const memberId = await requireMemberId(deps, loginId(request), name);
    await recordSlayerTaskCompletion(deps.db, memberId, {
      task,
      master: master ?? null,
      amountCompleted: amount_completed,
      outcome,
    });
    return reply.code(201).send();
  });

  app.post<{ Params: LoginNameParams }>('/api/login/:loginName/clue-completed', async (request, reply) => {
    const parsed = ClueCompletionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body' });
    }
    const { name, tier } = parsed.data;
    if (isSharedMember(name)) {
      return reply.code(400).send({ message: 'Invalid member name' });
    }

    const memberId = await requireMemberId(deps, loginId(request), name);
    await recordClueCompletion(deps.db, memberId, tier);
    return reply.code(201).send();
  });

  app.post<{ Params: LoginNameParams }>('/api/login/:loginName/death', async (request, reply) => {
    const parsed = DeathEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body' });
    }
    const { name, world_x, world_y, plane, killer } = parsed.data;
    if (isSharedMember(name)) {
      return reply.code(400).send({ message: 'Invalid member name' });
    }
    const failure = validateOptionalStringLength('killer', killer, DEATH_KILLER_MAX_LENGTH);
    if (failure && !failure.ok) {
      return reply.code(400).send({ message: failure.message });
    }

    const memberId = await requireMemberId(deps, loginId(request), name);
    await recordDeath(deps.db, memberId, {
      worldX: world_x ?? null,
      worldY: world_y ?? null,
      plane: plane ?? null,
      killer: killer ?? null,
    });
    return reply.code(201).send();
  });

  app.get<{ Params: LoginNameParams; Querystring: { from_time?: string } }>(
    '/api/login/:loginName/get-data',
    async (request, reply) => {
      const fromTime = request.query.from_time ? new Date(request.query.from_time) : new Date(0);
      if (Number.isNaN(fromTime.getTime())) {
        return reply.code(400).send({ message: 'Invalid from_time' });
      }
      const members = await getLoginData(deps.db, loginId(request), fromTime);
      return reply.send(members);
    },
  );

  app.get<{ Params: LoginNameParams; Querystring: { period?: string } }>(
    '/api/login/:loginName/get-skill-data',
    async (request, reply) => {
      const parsedPeriod = SkillDataPeriodSchema.safeParse(request.query.period);
      if (!parsedPeriod.success) {
        return reply.code(400).send({ message: 'Invalid period' });
      }
      const table = SKILL_PERIOD_TABLE[parsedPeriod.data]!;
      const data = await getSkillsForPeriod(deps.db, loginId(request), table);
      return reply.send(data);
    },
  );

  app.get('/api/login/:loginName/am-i-logged-in', async (_request, reply) => reply.code(200).send());

  app.get<{ Params: LoginNameParams; Querystring: { member_name?: string } }>(
    '/api/login/:loginName/am-i-a-member',
    async (request, reply) => {
      const memberName = request.query.member_name;
      if (!memberName) {
        return reply.code(400).send({ message: 'member_name is required' });
      }
      const isMember = await isMemberPresent(deps.db, loginId(request), memberName);
      if (!isMember) {
        return reply.code(401).send({ message: 'Player is not a member of this login' });
      }
      return reply.code(200).send();
    },
  );

  // Legacy stub: real collection log data lives in collection_log_v2, exposed via the
  // get_collection_log MCP tool instead. Always returns an empty map here, same as before.
  app.get('/api/login/:loginName/collection-log', async (_request, reply) => reply.send({}));
}
