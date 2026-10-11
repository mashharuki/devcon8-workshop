import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadSharedEnv } from "@x402-sample/config/node";
import dotenv from "dotenv";
import { createMcpServer, registerTools } from "./lib/tools.js";
import { parseEnv } from "./utils/env.js";
import { createFileStore } from "./utils/store.node.js";

// Read the package's .env regardless of cwd (Claude Code may start MCP from any directory)
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
// Load the chain and token from the shared configuration (pkgs/config/.env)
loadSharedEnv();

// MCP stdio is reserved for the protocol, so always send logs to stderr (console.error)

const server = createMcpServer();
registerTools(server, {
  getEnv: () => parseEnv(process.env),
  wallet: createFileStore(process.env.X402_MCP_HOME),
});

const main = async (): Promise<void> => {
  await server.connect(new StdioServerTransport());
  console.error("[x402mcp] ready on stdio");
};

main().catch((error) => {
  console.error("[x402mcp] fatal:", error);
  process.exit(1);
});
