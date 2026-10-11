import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadSharedEnv } from "@x402-sample/config/node";
import dotenv from "dotenv";
import { createMcpServer, registerTools } from "./lib/tools.js";
import { parseEnv } from "./utils/env.js";
import { createFileStore } from "./utils/store.node.js";

// cwdに依存せず、パッケージ直下の .env を読む(MCPはClaude Codeから任意のcwdで起動されうる)
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
// チェーン・トークンは共有設定(pkgs/config/.env)から読み込む
loadSharedEnv();

// MCPのstdioはプロトコル専用なので、ログは必ず stderr に出す(console.error)

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
