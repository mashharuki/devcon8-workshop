import { type Chain, parseUnits } from "viem";
import * as viemChains from "viem/chains";

/**
 * Shared logic for loading chain, token, and pricing configuration from environment variables.
 *
 * Values belong in each package's `.env` (or `vars` in wrangler.jsonc for Workers), not in code.
 * This file only defines how each variable name is interpreted.
 * When required variables are missing, the error lists only their key names, never their values.
 *
 * env can be either process.env or a Workers env binding.
 */

type EnvLike = object;

/**
 * Shared configuration stored in pkgs/config/.env (the deploy/dev scripts pass it to Workers with --var).
 * This type is added to each Worker's `Env` in the package's src/env.d.ts.
 */
export type SharedEnv = {
  CHAIN_NAME: string;
  ASSET_ADDRESS: string;
  /** Payment recipient, used as the server's payTo and as the destination allowed by the MCP Privy policy. */
  PAYEE_ADDRESS: string;
  TOKEN_NAME: string;
  TOKEN_VERSION: string;
  TOKEN_DECIMALS: string;
  PRICE_WEATHER: string;
  USAGE_UNIT_PRICE: string;
  USAGE_MAX_AMOUNT: string;
  /** Per-payment limit in atomic units. Each package supplies its own default when omitted. */
  MAX_AMOUNT_PER_PAYMENT?: string;
};

const readEnv = (env: EnvLike, key: string): string | undefined => {
  const value = (env as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

/** Ensures all required keys are present and throws an error listing only missing key names. */
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

// ===== Chain =====

const isChain = (value: unknown): value is Chain =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Chain).id === "number" &&
  typeof (value as Chain).name === "string" &&
  "rpcUrls" in value;

/**
 * Returns a chain definition from CHAIN_NAME (an export name from viem/chains, such as arcTestnet or baseSepolia).
 * After switching chains, fund the facilitator wallet with gas for the new chain.
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

/** Chain ID in CAIP-2 format (for example, eip155:5042002). */
export const getChainId = (env: EnvLike): `${string}:${string}` =>
  `eip155:${getChain(env).id}`;

// ===== Payment token =====

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const readAddress = (env: EnvLike, key: string): `0x${string}` => {
  const value = requireEnv(env, [key])[key];
  if (!ADDRESS_PATTERN.test(value)) {
    throw new Error(`${key} must be a 0x address`);
  }
  return value as `0x${string}`;
};

/** Payment token address (ASSET_ADDRESS). */
export const getTokenAddress = (env: EnvLike): `0x${string}` =>
  readAddress(env, "ASSET_ADDRESS");

/** Payment recipient address (PAYEE_ADDRESS), used by the server's payTo and the MCP allowlist. */
export const getPayeeAddress = (env: EnvLike): `0x${string}` =>
  readAddress(env, "PAYEE_ADDRESS");

export type Token = {
  address: `0x${string}`;
  /** Token EIP-712 domain name; must match the on-chain name(). */
  name: string;
  /** Token EIP-712 domain version; must match the on-chain version() or verify will revert. */
  version: string;
  decimals: number;
};

/** Full token metadata, used when a component such as the server needs a domain for signature verification. */
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

// ===== Pricing in token units (for USDC, "0.5" = 0.5 USDC) =====

export type Pricing = {
  /** GET /weather (exact): fixed price per request in atomic units. */
  weather: string;
  /** GET /usage (upto): price per unit in atomic units. */
  usageUnit: bigint;
  /** GET /usage (upto): maximum amount the client authorizes by signature, in atomic units. */
  usageMax: string;
};

/**
 * Converts an amount to atomic units.
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
 * Returns pricing derived from the current environment configuration.
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
