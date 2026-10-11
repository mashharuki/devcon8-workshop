import { type Chain, parseUnits } from "viem";
import * as viemChains from "viem/chains";

/**
 * チェーン・トークン・価格の設定を環境変数から読み込む共通ロジック
 *
 * 値そのものはコードに書かず、各パッケージの `.env`(Workers では wrangler.jsonc の vars)に書く。
 * このファイルは「どの変数名をどう解釈するか」だけを持つ。
 * 必須の変数が足りない場合は、値ではなくキー名だけをまとめたエラーを投げる。
 *
 * envには process.env でも Workers の env バインディングでも渡せる。
 */

type EnvLike = object;

/**
 * pkgs/config/.env に書く共有設定(Workers には deploy / dev のスクリプトが --var で渡す)
 * Workers の `Env` にはこの型を足している(各パッケージの src/env.d.ts)
 */
export type SharedEnv = {
  CHAIN_NAME: string;
  ASSET_ADDRESS: string;
  /** 支払いの受取先。serverの payTo と、mcpのPrivyポリシーが許可する送金先の両方に使う */
  PAYEE_ADDRESS: string;
  TOKEN_NAME: string;
  TOKEN_VERSION: string;
  TOKEN_DECIMALS: string;
  PRICE_WEATHER: string;
  USAGE_UNIT_PRICE: string;
  USAGE_MAX_AMOUNT: string;
  /** 1回の支払いの上限(atomic units)。省略時は各パッケージの既定値 */
  MAX_AMOUNT_PER_PAYMENT?: string;
};

const readEnv = (env: EnvLike, key: string): string | undefined => {
  const value = (env as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

/** 必須キーがすべてあることを確認し、足りなければキー名だけを列挙して投げる */
const requireEnv = <K extends string>(
  env: EnvLike,
  keys: readonly K[],
): Record<K, string> => {
  const missing = keys.filter((key) => readEnv(env, key) === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(", ")} (see the package's .env.example)`,
    );
  }
  return Object.fromEntries(
    keys.map((key) => [key, readEnv(env, key) as string]),
  ) as Record<K, string>;
};

// ===== チェーン =====

const isChain = (value: unknown): value is Chain =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Chain).id === "number" &&
  typeof (value as Chain).name === "string" &&
  "rpcUrls" in value;

/**
 * CHAIN_NAME(viem/chains のエクスポート名。例: arcTestnet, baseSepolia)からチェーン定義を返す
 * 切り替え後は、facilitatorのウォレットにそのチェーンのガス代を入れること。
 */
export const getChain = (env: EnvLike): Chain => {
  const { CHAIN_NAME } = requireEnv(env, ["CHAIN_NAME"]);
  const chain = (viemChains as Record<string, unknown>)[CHAIN_NAME];
  if (!isChain(chain)) {
    throw new Error(
      `CHAIN_NAME "${CHAIN_NAME}" is not a viem/chains export (examples: arcTestnet, baseSepolia)`,
    );
  }
  return chain;
};

/** CAIP-2形式のチェーンID(例: eip155:5042002) */
export const getChainId = (env: EnvLike): `${string}:${string}` =>
  `eip155:${getChain(env).id}`;

// ===== 決済トークン =====

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const readAddress = (env: EnvLike, key: string): `0x${string}` => {
  const value = requireEnv(env, [key])[key];
  if (!ADDRESS_PATTERN.test(value)) {
    throw new Error(`${key} must be a 0x address`);
  }
  return value as `0x${string}`;
};

/** 決済トークンのアドレス(ASSET_ADDRESS) */
export const getTokenAddress = (env: EnvLike): `0x${string}` =>
  readAddress(env, "ASSET_ADDRESS");

/** 支払いの受取先アドレス(PAYEE_ADDRESS)。serverのpayToとmcpの許可する送金先に使う */
export const getPayeeAddress = (env: EnvLike): `0x${string}` =>
  readAddress(env, "PAYEE_ADDRESS");

export type Token = {
  address: `0x${string}`;
  /** トークンのEIP-712ドメイン。オンチェーンの name() と一致させる */
  name: string;
  /** トークンのEIP-712ドメイン。オンチェーンの version() と一致させる(違うとverifyがrevertする) */
  version: string;
  decimals: number;
};

/** トークンの全情報。server のように署名検証用のドメインが必要な場合に使う */
export const getToken = (env: EnvLike): Token => {
  const { TOKEN_NAME, TOKEN_VERSION, TOKEN_DECIMALS } = requireEnv(env, [
    "TOKEN_NAME",
    "TOKEN_VERSION",
    "TOKEN_DECIMALS",
  ]);
  const decimals = Number(TOKEN_DECIMALS);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error("TOKEN_DECIMALS must be an integer between 0 and 36");
  }
  return {
    address: getTokenAddress(env),
    name: TOKEN_NAME,
    version: TOKEN_VERSION,
    decimals,
  };
};

// ===== 価格(トークンの単位。USDCなら "0.5" = 0.5 USDC) =====

export type Pricing = {
  /** GET /weather(exact): 1リクエストの固定料金(atomic units) */
  weather: string;
  /** GET /usage(upto): 1ユニットあたりの料金(atomic units) */
  usageUnit: bigint;
  /** GET /usage(upto): クライアントが署名で認可する最大額(atomic units) */
  usageMax: string;
};

/**
 * 金額をatomic unitに変換する
 * @param key 
 * @param amount 
 * @param decimals 
 * @returns 
 */
const toAtomic = (key: string, amount: string, decimals: number): bigint => {
  try {
    return parseUnits(amount, decimals);
  } catch {
    throw new Error(`${key} must be a decimal amount such as "0.5"`);
  }
};

/**
 * 現在の環境設定に基づいて価格情報を取得するメソッド
 * @param env 
 * @returns 
 */
export const getPricing = (env: EnvLike): Pricing => {
  const { decimals } = getToken(env);
  const { PRICE_WEATHER, USAGE_UNIT_PRICE, USAGE_MAX_AMOUNT } = requireEnv(
    env,
    ["PRICE_WEATHER", "USAGE_UNIT_PRICE", "USAGE_MAX_AMOUNT"],
  );
  return {
    weather: toAtomic("PRICE_WEATHER", PRICE_WEATHER, decimals).toString(),
    usageUnit: toAtomic("USAGE_UNIT_PRICE", USAGE_UNIT_PRICE, decimals),
    usageMax: toAtomic(
      "USAGE_MAX_AMOUNT",
      USAGE_MAX_AMOUNT,
      decimals,
    ).toString(),
  };
};
