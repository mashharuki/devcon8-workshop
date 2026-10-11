import { HTTPFacilitatorClient } from "@x402/core/server";

// ファシリテータークライアントの設定
export const createFacilitatorClient = (url: string): HTTPFacilitatorClient =>
  new HTTPFacilitatorClient({ url });
