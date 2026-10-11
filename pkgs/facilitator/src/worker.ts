import type { Hono } from "hono";
import { createApp } from "./app.js";
import { createFacilitator } from "./facilitator.js";

// appは不変でリクエスト状態を持たないため、isolate内で1回だけ作ってキャッシュする
let app: Hono | undefined;

export default {
  fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Response | Promise<Response> {
    // 未設定のままだと分かりにくいエラーになるため、先に検証する
    const privateKey: unknown = env.EVM_PRIVATE_KEY;
    if (typeof privateKey !== "string" || privateKey.length === 0) {
      const message = "facilitator misconfigured: missing EVM_PRIVATE_KEY";
      console.error(message);
      return Response.json({ error: message }, { status: 500 });
    }
    try {
      // CHAIN_NAME の不足や不正は createFacilitator の中でキー名つきのエラーになる
      app ??= createApp(createFacilitator(env));
    } catch (error) {
      const message = `facilitator misconfigured: ${error instanceof Error ? error.message : "Unknown error"}`;
      console.error(message);
      return Response.json({ error: message }, { status: 500 });
    }
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
