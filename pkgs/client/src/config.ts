import { wrapAxiosWithPayment, x402Client, x402HTTPClient } from "@x402/axios";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { UptoEvmScheme } from "@x402/evm/upto/client";
import { getChainId, getTokenAddress } from "@x402-sample/config";
import { loadSharedEnv } from "@x402-sample/config/node";
import axios from "axios";
import dotenv from "dotenv";
import "dotenv/config";
import { signer } from "./viem";

dotenv.config();
// Load the chain and token from the shared configuration (pkgs/config/.env)
loadSharedEnv();

// Load the chain and token from .env (CHAIN_NAME / ASSET_ADDRESS); parsing is defined in pkgs/config/src/index.ts
const NETWORK = getChainId(process.env);
const ASSET = getTokenAddress(process.env);

// Optional per-payment signing limit (atomic units; USDC has 6 decimals, so 1000000 = 1 USDC)
// The client rejects requests above this limit before signing
export const DEFAULT_MAX_AMOUNT_PER_PAYMENT =
  process.env.MAX_AMOUNT_PER_PAYMENT ?? "1000000";

/**
 * Creates an x402 client for payments.
 * @param maxAmountPerPayment Per-payment limit (atomic units)
 */
export const createPaymentClient = (
  maxAmountPerPayment: string = DEFAULT_MAX_AMOUNT_PER_PAYMENT,
): x402Client => {
  const client = new x402Client();

  // Register both fixed-price (exact) and usage-based (upto) payment schemes
  client.register(NETWORK, new ExactEvmScheme(signer));
  client.register(NETWORK, new UptoEvmScheme(signer));

  // A non-default asset must be specified here
  client.setSpendControls({
    allowedAssets: [
      {
        network: NETWORK,
        asset: ASSET,
        maxAmountPerPayment,
      },
    ],
  });

  return client;
};

const client = createPaymentClient();

// Create an Axios instance with payment handling
export const api = wrapAxiosWithPayment(
  axios.create({ baseURL: process.env.PAYWALL_API_BASE_URL }),
  client,
);
// Create the x402 HTTP client
export const httpClient = new x402HTTPClient(client);
