import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface McpSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

/** In-process, single-instance session store - same non-persistent semantics as before. */
export class McpSessionManager {
  private readonly sessions = new Map<string, McpSession>();

  get(sessionId: string): McpSession | undefined {
    return this.sessions.get(sessionId);
  }

  register(sessionId: string, session: McpSession): void {
    this.sessions.set(sessionId, session);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  get size(): number {
    return this.sessions.size;
  }
}
