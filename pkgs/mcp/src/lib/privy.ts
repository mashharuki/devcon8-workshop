import Privy from "@privy-io/js-sdk-core";
import { PrivyClient } from "@privy-io/node";
import { createViemAccount, type PrivyViemAccount } from "@privy-io/node/viem";
import { getChain } from "@x402-sample/config";
import type { Env } from "../utils/env.js";
import { fail, ok, type Result, toMessage } from "../utils/result.js";
import type { WalletState } from "../utils/store.js";
import { buildPolicy } from "./policy.js";

/** Minimal Storage implementation required by js-sdk-core; kept in memory outside a browser. */
class MemoryStorage {
  private readonly map = new Map<string, unknown>();
  get(key: string): unknown {
    return this.map.get(key);
  }
  put(key: string, value: unknown): void {
    this.map.set(key, value);
  }
  del(key: string): void {
    this.map.delete(key);
  }
  getKeys(): string[] {
    return [...this.map.keys()];
  }
}

export const createPrivyClient = (env: Env): PrivyClient =>
  new PrivyClient({ appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET });

/**
 * js-sdk-core assumes a browser and does not add Origin itself.
 * In Node, Privy rejects requests with "Must specify origin", so add it only for privy.io requests.
 */
let isOriginHeaderInstalled = false;

/**
 * Installs the Origin header.
 * @param origin
 * @returns
 */
const installOriginHeader = (origin: string): void => {
  if (isOriginHeaderInstalled) return;
  isOriginHeaderInstalled = true;
  const baseFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    if (!url.hostname.endsWith(".privy.io")) return baseFetch(input, init);

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    headers.set("Origin", origin);
    return baseFetch(input, { ...init, headers });
  };
};

/**
 * Client for email OTP login without a UI.
 */
export const createAuthClient = (env: Env): Privy => {
  installOriginHeader(env.PRIVY_ORIGIN);
  return new Privy({
    appId: env.PRIVY_APP_ID,
    clientId: env.PRIVY_CLIENT_ID,
    storage: new MemoryStorage(),
  });
};

/**
 * Sends a one-time password (OTP) by email.
 * Verify it with verifyLoginCode after sending.
 * If sending fails, ask the user to try again.
 * @param auth
 * @param email
 * @returns
 */
export const sendLoginCode = async (
  auth: Privy,
  email: string,
): Promise<Result<null>> => {
  try {
    // A successful send does not reveal whether the email address entered by the user exists
    await auth.auth.email.sendCode(email);
    return ok(null);
  } catch (error) {
    console.error("[privy] sendLoginCode failed:", toMessage(error));
    return fail(`failed to send the login code: ${toMessage(error)}`);
  }
};

export type LoginSession = { userId: string };

/**
 * Verifies the OTP and signs in.
 * This only confirms the user's identity; the user's JWT is not retained.
 * Wallet creation uses the app credentials and assigns this user as the owner.
 */
export const verifyLoginCode = async (
  auth: Privy,
  email: string,
  code: string,
): Promise<Result<LoginSession>> => {
  try {
    // Success returns a session containing the user ID
    const session = await auth.auth.email.loginWithCode(email, code);
    return ok({ userId: session.user.id });
  } catch (error) {
    console.error("[privy] verifyLoginCode failed:", toMessage(error));
    return fail(`login failed: ${toMessage(error)}`);
  }
};

const toBase64 = (buffer: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)));

/**
 * Generates a delegated key (P-256).
 * The public key is base64 DER (SPKI), and the private key is base64 PKCS8.
 */
const generateDelegateKey = async (): Promise<{
  publicKey: string;
  privateKey: string;
}> => {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const [spki, pkcs8] = await Promise.all([
    crypto.subtle.exportKey("spki", pair.publicKey),
    crypto.subtle.exportKey("pkcs8", pair.privateKey),
  ]);
  return { publicKey: toBase64(spki), privateKey: toBase64(pkcs8) };
};

/**
 * Creates a user-owned wallet and registers a policy-bound delegated key as an additional signer.
 * 1. Generate a delegated key locally, unique to this user on this device.
 * 2. Register the public key as a key quorum.
 * 3. Create a policy that restricts destinations, limits, and the chain.
 * 4. Create the wallet (owner = user) and apply the policy override to the delegated key.
 */
export const provisionWallet = async (
  privy: PrivyClient,
  env: Env,
  email: string,
  session: LoginSession,
): Promise<Result<WalletState>> => {
  try {
    // Generate the delegated key, create its quorum and policy, and add it to the wallet
    const delegate = await generateDelegateKey();

    const quorum = await privy.keyQuorums().create({
      // Privy's limit is 50 characters; did:privy:... is long, so use only its suffix
      display_name: `x402 delegate ${session.userId.slice(-20)}`,
      public_keys: [delegate.publicKey],
      authorization_threshold: 1,
    });

    // Create the policy and apply it to the delegated key
    const policy = await privy.policies().create(
      buildPolicy({
        chainId: getChain(env).id,
        asset: env.ASSET_ADDRESS as `0x${string}`,
        maxAmount: env.MAX_AMOUNT_PER_PAYMENT,
        payees: [env.PAYEE_ADDRESS],
      }),
    );

    // Create the wallet (owner = user) and apply the policy override to the delegated key
    const wallet = await privy.wallets().create({
      chain_type: "ethereum",
      owner: { user_id: session.userId },
      additional_signers: [
        { signer_id: quorum.id, override_policy_ids: [policy.id] },
      ],
    });

    return ok({
      email,
      userId: session.userId,
      walletId: wallet.id,
      address: wallet.address as `0x${string}`,
      signerId: quorum.id,
      policyId: policy.id,
      delegateKey: delegate.privateKey,
    });
  } catch (error) {
    console.error("[privy] provisionWallet failed:", toMessage(error));
    return fail(`failed to create the wallet: ${toMessage(error)}`);
  }
};

/**
 * A viem account that signs with the delegated key.
 * Privy evaluates the policy for every signature.
 */
export const createSignerAccount = (
  privy: PrivyClient,
  state: WalletState,
): PrivyViemAccount =>
  createViemAccount(privy, {
    walletId: state.walletId,
    address: state.address as `0x${string}`,
    authorizationContext: { authorization_private_keys: [state.delegateKey] },
  });
