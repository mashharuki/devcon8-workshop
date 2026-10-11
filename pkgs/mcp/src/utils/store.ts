import { z } from "zod";
import { fail, ok, type Result, toMessage } from "./result.js";

/** Locally stored wallet data. delegateKey is a delegated private key and must never be exposed. */
export const walletStateSchema = z.object({
  email: z.string(),
  userId: z.string(),
  walletId: z.string(),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  // ID of the additional signer (key quorum)
  signerId: z.string(),
  policyId: z.string(),
  // Delegated private key (base64 PKCS8), held only by this user on this device
  delegateKey: z.string(),
});

export type WalletState = z.infer<typeof walletStateSchema>;

export type WalletStore = {
  load: () => Promise<Result<WalletState | undefined>>;
  save: (state: WalletState) => Promise<Result<null>>;
};

/** Key-value-backed store for Workers, such as Durable Object storage. */
export type KeyValueStorage = {
  get: <T>(key: string) => Promise<T | undefined>;
  put: (key: string, value: unknown) => Promise<void>;
};

const WALLET_KEY = "wallet";

/**
 * Creates a WalletStore backed by KeyValueStorage.
 * @param storage
 * @returns
 */
export const createKvStore = (storage: KeyValueStorage): WalletStore => ({
  load: async () => {
    const raw = await storage.get<unknown>(WALLET_KEY);
    if (raw === undefined) return ok(undefined);
    const parsed = walletStateSchema.safeParse(raw);
    return parsed.success
      ? ok(parsed.data)
      : fail("invalid wallet state in storage");
  },
  save: async (state) => {
    try {
      await storage.put(WALLET_KEY, state);
      return ok(null);
    } catch (error) {
      return fail(`failed to save wallet state: ${toMessage(error)}`);
    }
  },
});
