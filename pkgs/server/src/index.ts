import { serve } from "@hono/node-server";
import { loadSharedEnv } from "@x402-sample/config/node";
import dotenv from "dotenv";
import { createApp } from "./app";
import type { ServerEnv } from "./config";

dotenv.config();
// Load the chain, token, and pricing from the shared configuration (pkgs/config/.env)
loadSharedEnv();

const { FACILITATOR_URL } = process.env;
if (!FACILITATOR_URL) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}

// createApp detects missing or invalid chain, token, or pricing values and returns an error naming the key
let app: ReturnType<typeof createApp>;
try {
  app = createApp(process.env as unknown as ServerEnv);
} catch (error) {
  console.error(
    "❌ invalid server configuration:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exit(1);
}

serve({
  fetch: app.fetch,
  port: 4021,
});
