import type { PrivyViemAccount } from "@privy-io/node/viem";
import { PERMIT2_ADDRESS } from "@x402/evm";
import {
  type Chain,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
} from "viem";
import { fail, ok, type Result, toMessage } from "../utils/result.js";

const createChainClient = (chain: Chain) =>
  createPublicClient({ chain, transport: http() });

export type WalletBalances = {
  /** トークン残高(atomic units) */
  balance: string;
  /** Permit2へのallowance = uptoスキームで使える予算の総額(atomic units) */
  allowance: string;
};

/**
 * ERC20トークンの残高とPermit2へのallowanceを取得する。
 * @param owner
 * @param token
 * @returns
 */
export const readBalances = async (
  chain: Chain,
  owner: `0x${string}`,
  token: `0x${string}`,
): Promise<Result<WalletBalances>> => {
  try {
    const publicClient = createChainClient(chain);
    const [balance, allowance] = await Promise.all([
      publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner],
      }),
      publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, PERMIT2_ADDRESS],
      }),
    ]);
    return ok({ balance: balance.toString(), allowance: allowance.toString() });
  } catch (error) {
    console.error("[chain] readBalances failed:", owner, toMessage(error));
    return fail(`failed to read balances: ${toMessage(error)}`);
  }
};

/**
 * Permit2へのallowanceを設定する。
 * 署名はPrivy(委任キー+ポリシー)、送信は自前のRPCで行う(PrivyのArc対応に依存しない)。
 */
export const approveBudget = async (
  chain: Chain,
  account: PrivyViemAccount,
  token: `0x${string}`,
  amount: bigint,
): Promise<Result<{ hash: string; status: string }>> => {
  try {
    const publicClient = createChainClient(chain);
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(),
    });
    const hash = await walletClient.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [PERMIT2_ADDRESS, amount],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return ok({ hash, status: receipt.status });
  } catch (error) {
    console.error(
      "[chain] approveBudget failed:",
      account.address,
      toMessage(error),
    );
    return fail(`approve failed: ${toMessage(error)}`);
  }
};
