import "dotenv/config";
import { PERMIT2_ADDRESS } from "@x402/evm";
import { getChain, getTokenAddress } from "@x402-sample/config";
import { loadSharedEnv } from "@x402-sample/config/node";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { signer } from "./viem";

// Load the chain and token from the shared configuration (pkgs/config/.env)
loadSharedEnv();

/**
 * Script that checks and sets the USDC allowance for Permit2 (prerequisite for the upto scheme).
 *
 * This allowance becomes the total spending limit enforced on-chain.
 * Approve only the budgeted amount rather than an unlimited allowance (maxUint256).
 *
 * Usage:
 *   pnpm x402client run approve [amount] [--execute]
 *   - amount: Amount to approve (atomic units). Defaults to 2000000 (= 2 USDC). Use 0 to revoke approval.
 *   - Without --execute, only displays the current value (no transaction is sent).
 */

const DEFAULT_ALLOWANCE = "2000000";

const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const isExecute = args.includes("--execute");
  const amountArg =
    args.find((arg) => !arg.startsWith("--")) ?? DEFAULT_ALLOWANCE;

  if (!/^\d+$/.test(amountArg)) {
    throw new Error(
      `amount must be a non-negative integer (atomic units): ${amountArg}`,
    );
  }
  // Load the chain and token from .env (CHAIN_NAME / ASSET_ADDRESS)
  const chain = getChain(process.env);
  const token = getTokenAddress(process.env);
  const amount = BigInt(amountArg);

  // Use the same chain as the server and facilitator
  const publicClient = createPublicClient({
    chain,
    transport: http(),
  });

  const current = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [signer.address, PERMIT2_ADDRESS],
  });

  console.log("owner    :", signer.address);
  console.log("token    :", token);
  console.log("spender  :", `${PERMIT2_ADDRESS} (Permit2)`);
  console.log("allowance:", current.toString(), "(current)");
  console.log("target   :", amount.toString());

  if (!isExecute) {
    console.log(
      "dry-run: No transaction was sent. Add --execute to submit it.",
    );
    return;
  }

  const walletClient = createWalletClient({
    account: signer,
    chain,
    transport: http(),
  });

  const hash = await walletClient.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [PERMIT2_ADDRESS, amount],
  });
  console.log("approve tx:", hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("status    :", receipt.status);
};

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
