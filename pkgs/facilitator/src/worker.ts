import type { Hono } from "hono";
import { createApp } from "./app.js";
import { createFacilitator } from "./facilitator.js";

// The app is immutable and holds no request state, so create and cache it once per isolate
let app: Hono | undefined;

export default {
  fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Response | Promise<Response> {
    // Validate first to avoid unclear errors when configuration is missing
    const privateKey: unknown = env.EVM_PRIVATE_KEY;
    if (typeof privateKey !== "string" || privateKey.length === 0) {
      const message = "facilitator misconfigured: missing EVM_PRIVATE_KEY";
      console.error(message);
      return Response.json({ error: message }, { status: 500 });
    }
    try {
      // createFacilitator reports a missing or invalid CHAIN_NAME with an error naming the key
      app ??= createApp(createFacilitator(env));
    } catch (error) {
      const message = `facilitator misconfigured: ${error instanceof Error ? error.message : "Unknown error"}`;
      console.error(message);
      return Response.json({ error: message }, { status: 500 });
    }
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
