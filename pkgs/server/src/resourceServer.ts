import { ExactEvmScheme } from "@x402/evm/exact/server";
import { UptoEvmScheme } from "@x402/evm/upto/server";
import { x402ResourceServer } from "@x402/hono";
import { createFacilitatorClient } from "./facilitator";

// Create the resource server and register fixed-price (exact) and usage-based (upto) schemes for the target chain
export const createResourceServer = (
  facilitatorUrl: string,
  chainId: `${string}:${string}`,
): x402ResourceServer => {
  const resourceServer = new x402ResourceServer(
    createFacilitatorClient(facilitatorUrl),
  );
  resourceServer.register(chainId, new ExactEvmScheme());
  resourceServer.register(chainId, new UptoEvmScheme());
  return resourceServer;
};
