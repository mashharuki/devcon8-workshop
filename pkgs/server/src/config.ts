import {
  getChainId,
  getPayeeAddress,
  getPricing,
  getToken,
  type SharedEnv,
} from "@x402-sample/config";

// Load the chain, token, and pricing from the shared configuration (pkgs/config/.env).
// Variable parsing is defined in pkgs/config/src/index.ts
export type ServerEnv = SharedEnv & {
  FACILITATOR_URL: string;
};

/** Throws for missing or invalid environment variables; call at startup to fail fast. */
export const resolveServerConfig = (env: ServerEnv) => ({
  chainId: getChainId(env),
  payTo: getPayeeAddress(env),
  token: getToken(env),
  pricing: getPricing(env),
});

// x402 configuration
export const createX402Config = (env: ServerEnv) => {
  const { chainId, payTo, token, pricing } = resolveServerConfig(env);
  // Payment token EIP-712 domain; must match the on-chain name() / version()
  const assetExtra = { name: token.name, version: token.version };

  return {
    "GET /weather": {
      accepts: [
        {
          scheme: "exact",
          price: {
            amount: pricing.weather,
            asset: token.address,
            extra: assetExtra,
          },
          network: chainId,
          payTo,
        },
      ],
      description:
        "Get real-time weather data including temperature, conditions, and humidity",
      mimeType: "application/json",
      // Do not attach the Bazaar discovery extension (declareDiscoveryExtension).
      // During validation on Workers, ajv uses new Function and causes the paid route to hang
    },
    "GET /usage": {
      accepts: [
        {
          scheme: "upto",
          price: {
            amount: pricing.usageMax,
            asset: token.address,
            extra: assetExtra,
          },
          network: chainId,
          payTo,
        },
      ],
      description:
        "Usage-based billing sample (upto): settles only the consumed units up to the authorized maximum",
      mimeType: "application/json",
    },
  };
};
