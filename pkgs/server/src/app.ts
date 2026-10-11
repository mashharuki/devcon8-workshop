import { paymentMiddleware, setSettlementOverrides } from "@x402/hono";
import { Hono } from "hono";
import {
  createX402Config,
  resolveServerConfig,
  type ServerEnv,
} from "./config";
import { createResourceServer } from "./resourceServer";

// Maximum units accepted per request (bounds the input to BigInt calculations)
const MAX_UNITS = 1000;

/** Creates a Hono app with x402-protected routes. */
export const createApp = (env: ServerEnv): Hono => {
  // Detect missing or invalid configuration here
  const { chainId, pricing } = resolveServerConfig(env);

  // Create the Hono instance
  const app = new Hono();

  // ===== STEP 2: x402 middleware =====
  // In workshop Step 1, comment out this block before starting (access is public and free).
  // In Step 2, uncomment it to enable the 402 challenge -> signature -> verification -> settlement flow.
  app.use(
    paymentMiddleware(
      createX402Config(env),
      createResourceServer(env.FACILITATOR_URL, chainId),
    ),
  );
  // ===== End of STEP 2 =====

  // Configure endpoints
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
   * Usage-based billing (upto) example.
   * Uses units x unit price as the actual settlement amount.
   * For validation, amounts above the authorization cap (USAGE_MAX_AMOUNT) are passed through without clamping.
   * This behavior demonstrates that Permit2/the facilitator rejects settlements above the cap.
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
