import type { PrivyViemAccount } from "@privy-io/node/viem";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { UptoEvmScheme } from "@x402/evm/upto/client";
import { wrapFetchWithPayment, x402Client, x402HTTPClient } from "@x402/fetch";
import { getChainId } from "@x402-sample/config";
import type { Env } from "../utils/env.js";
import { fail, ok, type Result, toMessage } from "../utils/result.js";

/**
 * x402 client for payments.
 * Also checks the per-payment limit on the client before signing.
 */
export const createPaymentClient = (
  signer: PrivyViemAccount,
  env: Env,
): x402Client => {
  // Create the x402 client
  const client = new x402Client();
  const chainId = getChainId(env);
  // Register signing schemes. Exact pays a fixed amount; Upto can pay any amount up to its cap
  client.register(chainId, new ExactEvmScheme(signer));
  client.register(chainId, new UptoEvmScheme(signer));
  // Set a per-payment cap to prevent unexpectedly large payments
  client.setSpendControls({
    allowedAssets: [
      {
        network: chainId,
        asset: env.ASSET_ADDRESS as `0x${string}`,
        maxAmountPerPayment: env.MAX_AMOUNT_PER_PAYMENT,
      },
    ],
  });
  return client;
};

export type PaidResponse = {
  status: number;
  paymentStatus: string;
  /** Settlement result (transaction hash, amount, and so on), or the reason for failure. */
  payment: unknown;
  /** Resource content. Treat as untrusted because it comes from an external server. */
  body: unknown;
};

/**
 * Fetches an x402 resource, signing and retrying after a 402 response.
 */
export const fetchPaid = async (
  client: x402Client,
  url: string,
): Promise<Result<PaidResponse>> => {
  try {
    // Wrap fetch so a 402 response is signed and retried
    const response = await wrapFetchWithPayment(fetch, client)(url);
    const text = await response.text();
    const body = parseJson(text);

    // Parse the response with x402HTTPClient; sign and retry after a 402 response
    const result = new x402HTTPClient(client).parsePaymentResult({
      status: response.status,
      getHeader: (name: string) => response.headers.get(name) ?? undefined,
      body,
    });

    return ok({
      status: response.status,
      paymentStatus: result.paymentStatus,
      payment: result.header,
      body: result.body,
    });
  } catch (error) {
    console.error("[x402] fetchPaid failed:", url, toMessage(error));
    return fail(toMessage(error));
  }
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    // Treat non-JSON content as text and truncate it when it is too long
    return text.slice(0, 2000);
  }
};
