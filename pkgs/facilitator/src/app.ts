import type { x402Facilitator } from "@x402/core/facilitator";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { Hono } from "hono";

/** Creates a Hono app that provides /verify, /settle, /supported, and /health. */
export const createApp = (facilitator: x402Facilitator): Hono => {
  const app = new Hono();

  // POST /verify
  // ========================================

  /**
   * Endpoint that validates a signed payment payload against its payment requirements.
   */
  app.post("/verify", async (c) => {
    try {
      // Parse the request body as JSON
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

      // Validate by calling the facilitator's verify method
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
   * Endpoint that settles a signed payment payload against its payment requirements.
   */
  app.post("/settle", async (c) => {
    try {
      // Parse the request body as JSON
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

      // Settle by calling the facilitator's settle method (submits the transaction)
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
          // No transaction was submitted after cancellation; use an empty transaction and unknown network to satisfy the type
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
   * Endpoint that returns the supported schemes and networks.
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
