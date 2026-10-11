import { HTTPFacilitatorClient } from "@x402/core/server";

// Facilitator client configuration
export const createFacilitatorClient = (url: string): HTTPFacilitatorClient =>
  new HTTPFacilitatorClient({ url });
