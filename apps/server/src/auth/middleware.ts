import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthDeps } from './resolve.js';
import { resolveGroupId } from './resolve.js';

declare module 'fastify' {
  interface FastifyRequest {
    groupId?: string;
  }
}

interface GroupNameParams {
  groupName: string;
}

function authorizationToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || header.trim() === '') return undefined;
  return header;
}

/**
 * REST auth preHandler: 400 on a missing/empty `Authorization` header, 401 once a header is
 * present but doesn't resolve to a real group. Mounted on every `/api/group/:groupName/*` route.
 */
export function createRestAuthPreHandler(deps: AuthDeps) {
  return async function restAuthPreHandler(
    request: FastifyRequest<{ Params: GroupNameParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const token = authorizationToken(request);
    if (token === undefined) {
      await reply.code(400).send();
      return;
    }

    const groupId = await resolveGroupId(deps, request.params.groupName, token);
    if (groupId === undefined) {
      await reply.code(401).send();
      return;
    }

    request.groupId = groupId;
  };
}

/**
 * MCP auth preHandler: 401 on a missing/empty header too (asymmetric with the REST 400 - this
 * mirrors the prior server's own REST/MCP split, not a bug). Mounted on `/mcp/:groupName`.
 */
export function createMcpAuthPreHandler(deps: AuthDeps) {
  return async function mcpAuthPreHandler(
    request: FastifyRequest<{ Params: GroupNameParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const token = authorizationToken(request);
    if (token === undefined) {
      await reply.code(401).send();
      return;
    }

    const groupId = await resolveGroupId(deps, request.params.groupName, token);
    if (groupId === undefined) {
      await reply.code(401).send();
      return;
    }

    request.groupId = groupId;
  };
}
