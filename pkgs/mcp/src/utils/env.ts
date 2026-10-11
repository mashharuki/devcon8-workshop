import { getChain } from "@x402-sample/config";
import { z } from "zod";
import { fail, ok, type Result } from "./result.js";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x address");
const atomic = z.string().regex(/^\d+$/, "must be an integer (atomic units)");

// 環境変数のスキーマ
const envSchema = z.object({
  PRIVY_APP_ID: z.string().min(1),
  PRIVY_APP_SECRET: z.string().min(1),
  PRIVY_CLIENT_ID: z.string().min(1),
  // Node の fetch は Origin を付けないため明示する。Privy Dashboard の Allowed origins に登録済みの値にする
  PRIVY_ORIGIN: z.url().default("http://localhost:5173"),
  // Privyポリシーで送金先として許可するアドレス。x402 serverの payTo と同じ値(共有設定の PAYEE_ADDRESS)
  PAYEE_ADDRESS: address,
  PAYWALL_API_BASE_URL: z.url().default("http://localhost:4021"),
  // 使うチェーン(viem/chains のエクスポート名。例: arcTestnet)。解釈は pkgs/config にある
  CHAIN_NAME: z.string().min(1),
  // 決済に使うトークンのアドレス
  ASSET_ADDRESS: address,
  // 1回の支払いの上限(atomic units)。clientの署名前チェックとPrivyポリシーの両方に使う
  MAX_AMOUNT_PER_PAYMENT: atomic.default("1000000"),
  // set_budget で一度に承認できる予算の上限(atomic units)
  MAX_BUDGET: atomic.default("10000000"),
});

export type Env = z.infer<typeof envSchema>;

/** 環境変数(または Workers の env バインディング)を検証する。不足・不正なキー名だけを返し、値は含めない */
export const parseEnv = (raw: unknown): Result<Env> => {
  const parsed = envSchema.safeParse(raw);
  if (parsed.success) {
    try {
      // CHAIN_NAME が viem/chains に無い場合はここで気づけるようにする
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
