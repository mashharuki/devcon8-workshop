import { ExactEvmScheme } from "@x402/evm/exact/server";
import { UptoEvmScheme } from "@x402/evm/upto/server";
import { x402ResourceServer } from "@x402/hono";
import { createFacilitatorClient } from "./facilitator";

// リソースサーバーを作成し、対象チェーンに固定額決済(exact)と使用量課金(upto)のスキームを登録
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
