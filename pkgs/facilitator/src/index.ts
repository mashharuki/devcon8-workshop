import { serve } from "@hono/node-server";
import { loadSharedEnv } from "@x402-sample/config/node";
import dotenv from "dotenv";
import { createApp } from "./app.js";
import { createFacilitator } from "./facilitator.js";

dotenv.config();
// Load the chain from the shared configuration (CHAIN_NAME in pkgs/config/.env)
loadSharedEnv();

const PORT = Number(process.env.PORT ?? 4022);

if (!process.env.EVM_PRIVATE_KEY) {
  console.error("❌ EVM_PRIVATE_KEY environment variable is required");
  process.exit(1);
}

// createFacilitator detects a missing or invalid CHAIN_NAME and returns an error naming the key
let facilitator: ReturnType<typeof createFacilitator>;
try {
  facilitator = createFacilitator({
    EVM_PRIVATE_KEY: process.env.EVM_PRIVATE_KEY,
    CHAIN_NAME: process.env.CHAIN_NAME ?? "",
    RPC_URL: process.env.RPC_URL,
  });
} catch (error) {
  console.error(
    "❌ invalid facilitator configuration:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exit(1);
}

serve(
  {
    fetch: createApp(facilitator).fetch,
    port: PORT,
  },
  (info) => {
    console.log(`🚀 Facilitator listening on http://localhost:${info.port}`);
  },
);
