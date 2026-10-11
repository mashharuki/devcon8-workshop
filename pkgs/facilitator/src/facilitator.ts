import { x402Facilitator } from "@x402/core/facilitator";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import { UptoEvmScheme } from "@x402/evm/upto/facilitator";
import { getChain, getChainId } from "@x402-sample/config";
import { createEvmSigner } from "./viem.js";

export type FacilitatorEnv = {
  EVM_PRIVATE_KEY: string;
  /** Export name from viem/chains (for example, arcTestnet), parsed by pkgs/config. */
  CHAIN_NAME: string;
  /** Uses the chain's default RPC when omitted. */
  RPC_URL?: string;
};

/** Minimal fields safe to include in hook logs; excludes signatures and complete payloads. */
type HookContext = {
  requirements?: { scheme?: string; network?: string; amount?: string };
  result?: { success?: boolean; transaction?: string; errorReason?: string };
  error?: { message?: string };
};

const summarize = (context: object): Record<string, unknown> => {
  const { requirements, result, error } = context as HookContext;
  return {
    scheme: requirements?.scheme,
    network: requirements?.network,
    amount: requirements?.amount,
    success: result?.success,
    transaction: result?.transaction,
    errorReason: result?.errorReason,
    error: error?.message,
  };
};

const logStage = (stage: string, context: object): void => {
  console.log(`================ ${stage} ================`, summarize(context));
};

/** Creates a facilitator instance and registers the exact and upto schemes. */
export const createFacilitator = (env: FacilitatorEnv): x402Facilitator => {
  const evmSigner = createEvmSigner(
    env.EVM_PRIVATE_KEY as `0x${string}`,
    getChain(env),
    env.RPC_URL,
  );

  const facilitator = new x402Facilitator()
    .onBeforeVerify(async (context) => logStage("Before verify", context))
    .onAfterVerify(async (context) => logStage("After verify", context))
    .onVerifyFailure(async (context) => logStage("Verify failure", context))
    .onBeforeSettle(async (context) => logStage("Before settle", context))
    .onAfterSettle(async (context) => logStage("After settle", context))
    .onSettleFailure(async (context) => logStage("Settle failure", context));

  const network = getChainId(env) as `eip155:${number}`;
  facilitator.register(
    network,
    new ExactEvmScheme(evmSigner, { eip6492AllowedFactories: [] }),
  );
  facilitator.register(network, new UptoEvmScheme(evmSigner));

  return facilitator;
};
