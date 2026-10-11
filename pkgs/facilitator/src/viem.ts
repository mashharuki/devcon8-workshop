import { toFacilitatorEvmSigner } from "@x402/evm";
import { type Chain, createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * 指定したチェーンのFacilitator EVM signerを作成する。
 * @param privateKey Facilitatorが決済トランザクションに署名する秘密鍵
 * @param chain 対象チェーン
 * @param rpcUrl 省略時はチェーン既定のRPC
 */
export const createEvmSigner = (
  privateKey: `0x${string}`,
  chain: Chain,
  rpcUrl?: string,
) => {
  const evmAccount = privateKeyToAccount(privateKey);
  console.info(`EVM Facilitator account: ${evmAccount.address}`);

  const viemClient = createWalletClient({
    account: evmAccount,
    chain,
    transport: http(rpcUrl),
  }).extend(publicActions);

  return toFacilitatorEvmSigner({
    getCode: (args: { address: `0x${string}` }) => viemClient.getCode(args),

    address: evmAccount.address,

    readContract: (args: {
      address: `0x${string}`;
      abi: readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
    }) =>
      viemClient.readContract({
        ...args,
        args: args.args ?? [],
      }),

    verifyTypedData: (args: {
      address: `0x${string}`;
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
      signature: `0x${string}`;
    }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      viemClient.verifyTypedData(args as any),

    writeContract: (args: {
      address: `0x${string}`;
      abi: readonly unknown[];
      functionName: string;
      args: readonly unknown[];
    }) =>
      viemClient.writeContract({
        ...args,
        args: args.args ?? [],
      }),

    sendTransaction: (args: { to: `0x${string}`; data: `0x${string}` }) =>
      viemClient.sendTransaction(args),

    waitForTransactionReceipt: (args: { hash: `0x${string}` }) =>
      viemClient.waitForTransactionReceipt(args),
  });
};
