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

const createChainClient = (chain: Chain, rpcUrl?: string) =>
  createPublicClient({ chain, transport: http(rpcUrl) });

export type WalletBalances = {
  /** Token balance in atomic units. */
  balance: string;
  /** Permit2 allowance: total budget available to the upto scheme, in atomic units. */
  allowance: string;
};

/**
 * Gets the ERC-20 token balance and Permit2 allowance.
 * @param owner
 * @param token
 * @returns
 */
export const readBalances = async (
  chain: Chain,
  owner: `0x${string}`,
  token: `0x${string}`,
  rpcUrl?: string,
): Promise<Result<WalletBalances>> => {
  try {
    const publicClient = createChainClient(chain, rpcUrl);
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
 * Sets the Permit2 allowance.
 * Privy signs with the delegated key and policy, while the app submits through its own RPC
 * so the flow does not depend on Privy's Arc support.
 */
export const approveBudget = async (
  chain: Chain,
  account: PrivyViemAccount,
  token: `0x${string}`,
  amount: bigint,
  rpcUrl?: string,
): Promise<Result<{ hash: string; status: string }>> => {
  try {
    const publicClient = createChainClient(chain, rpcUrl);
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
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
