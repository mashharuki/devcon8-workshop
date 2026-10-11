import { getChain } from "@x402-sample/config";
import { z } from "zod";
import { fail, ok, type Result } from "./result.js";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x address");
const atomic = z.string().regex(/^\d+$/, "must be an integer (atomic units)");

// Environment variable schema
const envSchema = z.object({
  PRIVY_APP_ID: z.string().min(1),
  PRIVY_APP_SECRET: z.string().min(1),
  PRIVY_CLIENT_ID: z.string().min(1),
  // Node fetch does not add Origin, so specify one registered in Privy Dashboard's Allowed origins
  PRIVY_ORIGIN: z.url().default("http://localhost:5173"),
  // Destination allowed by the Privy policy; same as the x402 server's payTo (shared PAYEE_ADDRESS)
  PAYEE_ADDRESS: address,
  PAYWALL_API_BASE_URL: z.url().default("http://localhost:4021"),
  // Target chain (an export name from viem/chains, such as arcTestnet); parsed by pkgs/config
  CHAIN_NAME: z.string().min(1),
  // Address of the payment token
  ASSET_ADDRESS: address,
  // Per-payment limit in atomic units; used by the client's pre-signing check and the Privy policy
  MAX_AMOUNT_PER_PAYMENT: atomic.default("1000000"),
  // Maximum budget set_budget can approve at once, in atomic units
  MAX_BUDGET: atomic.default("10000000"),
});

export type Env = z.infer<typeof envSchema>;

/** Validates environment variables or Workers env bindings, reporting invalid key names without their values. */
export const parseEnv = (raw: unknown): Result<Env> => {
  const parsed = envSchema.safeParse(raw);
  if (parsed.success) {
    try {
      // Validate here so an unknown CHAIN_NAME export from viem/chains is caught early
      getChain(parsed.data);
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : "Invalid CHAIN_NAME",
      );
    }
    return ok(parsed.data);
  }

  const keys = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
  return fail(
    `Invalid or missing environment variables (PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_CLIENT_ID, CHAIN_NAME, ASSET_ADDRESS, PAYEE_ADDRESS): ${keys.join(", ")}`,
  );
};
