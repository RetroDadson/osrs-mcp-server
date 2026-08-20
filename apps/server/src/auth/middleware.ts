import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthDeps } from './resolve.js';
import { resolveLogin } from './resolve.js';

declare module 'fastify' {
  interface FastifyRequest {
    loginId?: string;
    loginName?: string;
  }
}

function authorizationToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || header.trim() === '') return undefined;
  return header;
}

/**
 * REST auth preHandler: 400 on a missing/empty `Authorization` header, 401 once a header is
 * present but doesn't resolve to a real login. Mounted on every authed `/api/*` route.
 */
export function createRestAuthPreHandler(deps: AuthDeps) {
  return async function restAuthPreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = authorizationToken(request);
    if (token === undefined) {
      await reply.code(400).send();
      return;
    }

    const login = await resolveLogin(deps, token);
    if (login === undefined) {
      await reply.code(401).send();
      return;
    }

    request.loginId = login.loginId;
    request.loginName = login.loginName;
  };
}

/**
 * MCP auth preHandler: 401 on a missing/empty header too (asymmetric with the REST 400 - this
 * mirrors the prior server's own REST/MCP split, not a bug). Mounted on `/mcp`.
 */
export function createMcpAuthPreHandler(deps: AuthDeps) {
  return async function mcpAuthPreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = authorizationToken(request);
    if (token === undefined) {
      await reply.code(401).send();
      return;
    }

    const login = await resolveLogin(deps, token);
    if (login === undefined) {
      await reply.code(401).send();
      return;
    }

    request.loginId = login.loginId;
    request.loginName = login.loginName;
  };
}
