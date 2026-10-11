import { wrapAxiosWithPayment, x402Client, x402HTTPClient } from "@x402/axios";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { UptoEvmScheme } from "@x402/evm/upto/client";
import { getChainId, getTokenAddress } from "@x402-sample/config";
import { loadSharedEnv } from "@x402-sample/config/node";
import axios from "axios";
import dotenv from "dotenv";
import "dotenv/config";
import { signer } from "./viem";

dotenv.config();
// チェーン・トークンは共有設定(pkgs/config/.env)から読み込む
loadSharedEnv();

// チェーンとトークンは .env(CHAIN_NAME / ASSET_ADDRESS)から読み込む。解釈は pkgs/config/src/index.ts にある
const NETWORK = getChainId(process.env);
const ASSET = getTokenAddress(process.env);

// 1回の支払いで署名を許可する上限(atomic units, USDCはdecimals=6なので 1000000 = 1 USDC)。省略可
// 超える要求は署名する前にclient側で拒否される
export const DEFAULT_MAX_AMOUNT_PER_PAYMENT =
  process.env.MAX_AMOUNT_PER_PAYMENT ?? "1000000";

/**
 * 支払い用のx402クライアントを作成する
 * @param maxAmountPerPayment 1回の支払いの上限(atomic units)
 */
export const createPaymentClient = (
  maxAmountPerPayment: string = DEFAULT_MAX_AMOUNT_PER_PAYMENT,
): x402Client => {
  const client = new x402Client();

  // 固定額決済(exact)と使用量課金(upto)の両方を登録
  client.register(NETWORK, new ExactEvmScheme(signer));
  client.register(NETWORK, new UptoEvmScheme(signer));

  // デフォルト以外のアセットを指定する場合はここで指定する必要あり
  client.setSpendControls({
    allowedAssets: [
      {
        network: NETWORK,
        asset: ASSET,
        maxAmountPerPayment,
      },
    ],
  });

  return client;
};

const client = createPaymentClient();

// Create an Axios instance with payment handling
export const api = wrapAxiosWithPayment(
  axios.create({ baseURL: process.env.PAYWALL_API_BASE_URL }),
  client,
);
// x402 の HTTP クライアントを作成
export const httpClient = new x402HTTPClient(client);
