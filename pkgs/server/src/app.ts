import { paymentMiddleware, setSettlementOverrides } from "@x402/hono";
import { Hono } from "hono";
import {
  createX402Config,
  resolveServerConfig,
  type ServerEnv,
} from "./config";
import { createResourceServer } from "./resourceServer";

// 1リクエストで受け付ける最大ユニット数(BigInt計算の入力を制限する)
const MAX_UNITS = 1000;

/** x402で課金されるHonoアプリを作成する */
export const createApp = (env: ServerEnv): Hono => {
  // 設定の不足・不正はここで検出する
  const { chainId, pricing } = resolveServerConfig(env);

  // Honoインスタンスの作成
  const app = new Hono();

  // ===== STEP 2: x402ミドルウェア =====
  // ワークショップのStep 1ではこのブロックをコメントアウトして起動する(課金されず、誰でもアクセスできる)。
  // Step 2でコメントアウトを外すと、402チャレンジ→署名→検証→決済のフローが有効になる。
  app.use(
    paymentMiddleware(
      createX402Config(env),
      createResourceServer(env.FACILITATOR_URL, chainId),
    ),
  );
  // ===== STEP 2 ここまで =====

  // エンドポイントの設定
  app.get("/health", (c) => {
    return c.json({
      report: {
        status: "OK",
      },
    });
  });

  app.get("/weather", (c) => {
    return c.json({
      report: {
        weather: "sunny",
        temperature: 70,
      },
    });
  });

  /**
   * 使用量課金(upto)のサンプル
   * units × 単価を実際の決済額として指定する。
   * 検証のため、認可上限(USAGE_MAX_AMOUNT)を超える場合も丸めずにそのまま指定する。
   * 上限超過の決済はPermit2/facilitator側で拒否されることを確認するための挙動。
   */
  app.get("/usage", (c) => {
    const units = Number(c.req.query("units") ?? "1");

    if (!Number.isInteger(units) || units < 1 || units > MAX_UNITS) {
      return c.json(
        { error: `units must be an integer in 1..${MAX_UNITS}` },
        400,
      );
    }

    const amount = (BigInt(units) * pricing.usageUnit).toString();
    setSettlementOverrides(c, { amount });

    return c.json({ report: { units, charged: amount } });
  });

  return app;
};
