import { serve } from "@hono/node-server";
import { loadSharedEnv } from "@x402-sample/config/node";
import dotenv from "dotenv";
import { createApp } from "./app";
import type { ServerEnv } from "./config";

dotenv.config();
// チェーン・トークン・価格は共有設定(pkgs/config/.env)から読み込む
loadSharedEnv();

const { FACILITATOR_URL } = process.env;
if (!FACILITATOR_URL) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}

// チェーン・トークン・価格の不足や不正は createApp の中で検出され、キー名つきのエラーになる
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
