import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { createMcpServer, registerTools } from "./lib/tools.js";
import { parseEnv } from "./utils/env.js";
import { guardRequest } from "./utils/guard.js";
import { createKvStore } from "./utils/store.js";

/**
 * Creates the v1.0.0 MCP server.
 * It exposes five tools: wallet_status, wallet_login_start, wallet_login_verify, set_budget, and pay_and_fetch.
 */
export class X402Mcp extends McpAgent<Env> {
  server: McpServer = createMcpServer();

  /**
   * Initialization method that registers the tools.
   */
  async init(): Promise<void> {
    registerTools(this.server, {
      getEnv: () => parseEnv(this.env),
      wallet: createKvStore(this.ctx.storage),
    });
  }
}

// MCP server entry point
const mcpHandler = X402Mcp.serve("/mcp");

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const denied = await guardRequest(request, env);
    if (denied) return denied;
    return mcpHandler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
