import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  ClueCompletionSchema,
  DeathEventSchema,
  DEATH_KILLER_MAX_LENGTH,
  GroupMemberUpdateSchema,
  MEMBER_PROP_LIMITS,
  RenameGroupMemberSchema,
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
  addGroupMember,
  deleteGroupMember,
  getMemberId,
  isMemberInGroup,
  renameGroupMember,
} from '../db/groups.js';
import { getGroupData } from '../db/group-data.js';
import { getSkillsForPeriod, type SkillsPeriodTable } from '../db/skills.js';
import { recordClueCompletion, recordDeath, recordSlayerTaskCompletion } from '../db/events.js';
import { toPendingUpdate } from './mappers.js';
import type { RouteDeps } from './deps.js';

interface GroupNameParams {
  groupName: string;
}

function isSharedMember(name: string): boolean {
  return name.toLowerCase() === SHARED_MEMBER.toLowerCase();
}

async function requireMemberId(
  deps: RouteDeps,
  groupId: string,
  memberName: string,
): Promise<string> {
  const memberId = await getMemberId(deps.db, groupId, memberName);
  if (memberId === undefined) {
    throw new Error(`No member named "${memberName}" in group ${groupId}`);
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
  const groupId = (request: FastifyRequest): string => request.groupId!;

  app.post<{ Params: GroupNameParams; Body: { name?: string } }>(
    '/api/group/:groupName/add-group-member',
    async (request, reply) => {
      const name = request.body?.name;
      if (!name || isSharedMember(name) || !validName(name)) {
        return reply.code(400).send({ message: 'Invalid member name' });
      }
      await addGroupMember(deps.db, groupId(request), name);
      return reply.code(201).send();
    },
  );

  app.delete<{ Params: GroupNameParams; Body: { name?: string } }>(
    '/api/group/:groupName/delete-group-member',
    async (request, reply) => {
      const name = request.body?.name;
      if (!name || isSharedMember(name)) {
        return reply.code(400).send({ message: 'Invalid member name' });
      }
      await deleteGroupMember(deps.db, groupId(request), name);
      return reply.code(200).send();
    },
  );

  app.put<{ Params: GroupNameParams }>('/api/group/:groupName/rename-group-member', async (request, reply) => {
    const parsed = RenameGroupMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body' });
    }
    const { original_name, new_name } = parsed.data;
    if (isSharedMember(original_name) || isSharedMember(new_name) || !validName(new_name)) {
      return reply.code(400).send({ message: 'Invalid member name' });
    }
    await renameGroupMember(deps.db, groupId(request), original_name, new_name);
    return reply.code(200).send();
  });

  app.post<{ Params: GroupNameParams }>('/api/group/:groupName/update-group-member', async (request, reply) => {
    const parsed = GroupMemberUpdateSchema.safeParse(request.body);
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

    deps.batcher.enqueue(toPendingUpdate(groupId(request), update));
    return reply.code(200).send();
  });

  app.post<{ Params: GroupNameParams }>('/api/group/:groupName/slayer-task-completed', async (request, reply) => {
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

    const memberId = await requireMemberId(deps, groupId(request), name);
    await recordSlayerTaskCompletion(deps.db, memberId, {
      task,
      master: master ?? null,
      amountCompleted: amount_completed,
      outcome,
    });
    return reply.code(201).send();
  });

  app.post<{ Params: GroupNameParams }>('/api/group/:groupName/clue-completed', async (request, reply) => {
    const parsed = ClueCompletionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body' });
    }
    const { name, tier } = parsed.data;
    if (isSharedMember(name)) {
      return reply.code(400).send({ message: 'Invalid member name' });
    }

    const memberId = await requireMemberId(deps, groupId(request), name);
    await recordClueCompletion(deps.db, memberId, tier);
    return reply.code(201).send();
  });

  app.post<{ Params: GroupNameParams }>('/api/group/:groupName/death', async (request, reply) => {
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

    const memberId = await requireMemberId(deps, groupId(request), name);
    await recordDeath(deps.db, memberId, {
      worldX: world_x ?? null,
      worldY: world_y ?? null,
      plane: plane ?? null,
      killer: killer ?? null,
    });
    return reply.code(201).send();
  });

  app.get<{ Params: GroupNameParams; Querystring: { from_time?: string } }>(
    '/api/group/:groupName/get-group-data',
    async (request, reply) => {
      const fromTime = request.query.from_time ? new Date(request.query.from_time) : new Date(0);
      if (Number.isNaN(fromTime.getTime())) {
        return reply.code(400).send({ message: 'Invalid from_time' });
      }
      const members = await getGroupData(deps.db, groupId(request), fromTime);
      return reply.send(members);
    },
  );

  app.get<{ Params: GroupNameParams; Querystring: { period?: string } }>(
    '/api/group/:groupName/get-skill-data',
    async (request, reply) => {
      const parsedPeriod = SkillDataPeriodSchema.safeParse(request.query.period);
      if (!parsedPeriod.success) {
        return reply.code(400).send({ message: 'Invalid period' });
      }
      const table = SKILL_PERIOD_TABLE[parsedPeriod.data]!;
      const data = await getSkillsForPeriod(deps.db, groupId(request), table);
      return reply.send(data);
    },
  );

  app.get('/api/group/:groupName/am-i-logged-in', async (_request, reply) => reply.code(200).send());

  app.get<{ Params: GroupNameParams; Querystring: { member_name?: string } }>(
    '/api/group/:groupName/am-i-in-group',
    async (request, reply) => {
      const memberName = request.query.member_name;
      if (!memberName) {
        return reply.code(400).send({ message: 'member_name is required' });
      }
      const inGroup = await isMemberInGroup(deps.db, groupId(request), memberName);
      if (!inGroup) {
        return reply.code(401).send({ message: 'Player is not a member of this group' });
      }
      return reply.code(200).send();
    },
  );

  // Legacy stub: real collection log data lives in collection_log_v2, exposed via the
  // get_collection_log MCP tool instead. Always returns an empty map here, same as before.
  app.get('/api/group/:groupName/collection-log', async (_request, reply) => reply.send({}));
}
