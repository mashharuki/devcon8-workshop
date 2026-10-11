import type { Hono } from "hono";
import { createApp } from "./app";

// The app is immutable and holds no request state, so create and cache it once per isolate
let app: Hono | undefined;

// Required environment variables (errors include key names only, never values)
const REQUIRED_KEYS = ["FACILITATOR_URL"] as const;

export default {
  fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Response | Promise<Response> {
    // Validate first to avoid unclear errors when configuration is missing
    const missing = REQUIRED_KEYS.filter((key) => {
      const value: unknown = env[key];
      return typeof value !== "string" || value.length === 0;
    });
    if (missing.length > 0) {
      const message = `server misconfigured: missing ${missing.join(", ")}`;
      console.error(message);
      return Response.json({ error: message }, { status: 500 });
    }
    try {
      // createApp reports missing or invalid chain, token, or pricing values with an error naming the key
      app ??= createApp(env);
    } catch (error) {
      const message = `server misconfigured: ${error instanceof Error ? error.message : "Unknown error"}`;
      console.error(message);
      return Response.json({ error: message }, { status: 500 });
    }
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
