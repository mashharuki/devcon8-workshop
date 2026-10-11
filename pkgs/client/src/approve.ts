import "dotenv/config";
import { PERMIT2_ADDRESS } from "@x402/evm";
import { getChain, getTokenAddress } from "@x402-sample/config";
import { loadSharedEnv } from "@x402-sample/config/node";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { signer } from "./viem";

// チェーン・トークンは共有設定(pkgs/config/.env)から読み込む
loadSharedEnv();

/**
 * USDCのPermit2へのallowanceを確認・設定するスクリプト(uptoスキームの事前準備)
 *
 * このallowanceが「オンチェーンで強制される総額の上限」になる。
 * 無制限(maxUint256)にせず、予算ぶんだけを承認する。
 *
 * 使い方:
 *   pnpm x402client run approve [amount] [--execute]
 *   - amount: 承認額(atomic units)。省略時は 2000000 (= 2 USDC)。0 を指定すると承認を取り消す
 *   - --execute を付けない場合は現在値の表示のみ(トランザクションは送らない)
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
  // チェーンとトークンは .env(CHAIN_NAME / ASSET_ADDRESS)から読み込む
  const chain = getChain(process.env);
  const token = getTokenAddress(process.env);
  const amount = BigInt(amountArg);

  // サーバー/facilitatorと同じチェーンを使う
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
      "dry-run: トランザクションは送っていません。実行するには --execute を付けてください",
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
