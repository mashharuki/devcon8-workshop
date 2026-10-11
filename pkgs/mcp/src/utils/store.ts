import { z } from "zod";
import { fail, ok, type Result, toMessage } from "./result.js";

/** ローカルに保存するウォレット情報。delegateKey は委任キーの秘密鍵なので外に出さない */
export const walletStateSchema = z.object({
  email: z.string(),
  userId: z.string(),
  walletId: z.string(),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  // 追加署名者(key quorum)のID
  signerId: z.string(),
  policyId: z.string(),
  // 委任キーの秘密鍵(base64 PKCS8)。この端末のこのユーザーだけが持つ
  delegateKey: z.string(),
});

export type WalletState = z.infer<typeof walletStateSchema>;

export type WalletStore = {
  load: () => Promise<Result<WalletState | undefined>>;
  save: (state: WalletState) => Promise<Result<null>>;
};

/** Durable Objectストレージ等のKey-Valueに保存するストア(Workers用) */
export type KeyValueStorage = {
  get: <T>(key: string) => Promise<T | undefined>;
  put: (key: string, value: unknown) => Promise<void>;
};

const WALLET_KEY = "wallet";

/**
 * KeyValueStorageを用いてWalletStoreを作成する
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
