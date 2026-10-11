import type { x402Facilitator } from "@x402/core/facilitator";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { Hono } from "hono";

/** /verify /settle /supported /health を提供するHonoアプリを作成する */
export const createApp = (facilitator: x402Facilitator): Hono => {
  const app = new Hono();

  // POST /verify
  // ========================================

  /**
   * 署名済みの支払いペイロードと支払い要件を検証するエンドポイント
   */
  app.post("/verify", async (c) => {
    try {
      // リクエストボディをJSONとしてパース
      const body = await c.req.json<{
        paymentPayload?: PaymentPayload;
        paymentRequirements?: PaymentRequirements;
      }>();

      const { paymentPayload, paymentRequirements } = body;

      if (!paymentPayload || !paymentRequirements) {
        return c.json(
          {
            error: "Missing paymentPayload or paymentRequirements",
          },
          400,
        );
      }

      // ファシリテーターのverifyメソッドを呼び出して検証
      const response: VerifyResponse = await facilitator.verify(
        paymentPayload,
        paymentRequirements,
      );

      return c.json(response);
    } catch (error) {
      console.error("Verify error:", error);

      return c.json(
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  });

  // ========================================
  // POST /settle
  // ========================================

  /**
   * 署名済みの支払いペイロードと支払い要件を使用して決済を行うエンドポイント
   */
  app.post("/settle", async (c) => {
    try {
      // リクエストボディをJSONとしてパース
      const body = await c.req.json<{
        paymentPayload?: PaymentPayload;
        paymentRequirements?: PaymentRequirements;
      }>();

      const { paymentPayload, paymentRequirements } = body;

      if (!paymentPayload || !paymentRequirements) {
        return c.json(
          {
            error: "Missing paymentPayload or paymentRequirements",
          },
          400,
        );
      }

      // ファシリテーターのsettleメソッドを呼び出して決済(トランザクションを流す)
      const response: SettleResponse = await facilitator.settle(
        paymentPayload,
        paymentRequirements,
      );

      return c.json(response);
    } catch (error) {
      console.error("Settle error:", error);

      if (
        error instanceof Error &&
        error.message.includes("Settlement aborted:")
      ) {
        const response: SettleResponse = {
          success: false,
          errorReason: error.message.replace("Settlement aborted: ", ""),
          // 中断時は未送信のため transaction は空文字、network は不明として型を合わせる
          transaction: "",
          network: "unknown" as SettleResponse["network"],
        };

        return c.json(response);
      }

      return c.json(
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  });

  // ========================================
  // GET /supported
  // ========================================

  /**
   * サポートされているスキームとネットワークを返すエンドポイント
   */
  app.get("/supported", (c) => {
    try {
      const response = facilitator.getSupported();

      return c.json(response);
    } catch (error) {
      console.error("Supported error:", error);

      return c.json(
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  });

  // ========================================
  // Health check
  // ========================================

  app.get("/health", (c) => {
    return c.json({
      status: "ok",
    });
  });

  return app;
};
