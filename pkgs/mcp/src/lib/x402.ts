import type { PrivyViemAccount } from "@privy-io/node/viem";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { UptoEvmScheme } from "@x402/evm/upto/client";
import { wrapFetchWithPayment, x402Client, x402HTTPClient } from "@x402/fetch";
import { getChainId } from "@x402-sample/config";
import type { Env } from "../utils/env.js";
import { fail, ok, type Result, toMessage } from "../utils/result.js";

/**
 * 支払い用のx402クライアント。
 * 署名前に1回あたりの上限をclient側でも確認する
 */
export const createPaymentClient = (
  signer: PrivyViemAccount,
  env: Env,
): x402Client => {
  // x402Clientを作成
  const client = new x402Client();
  const chainId = getChainId(env);
  // 署名スキームを登録する。Exactは1回あたりの正確な金額、Uptoは上限までの任意の金額で支払える
  client.register(chainId, new ExactEvmScheme(signer));
  client.register(chainId, new UptoEvmScheme(signer));
  // 1回あたりの上限を設定する。これにより、ユーザーが意図しない大きな支払いを防ぐ
  client.setSpendControls({
    allowedAssets: [
      {
        network: chainId,
        asset: env.ASSET_ADDRESS as `0x${string}`,
        maxAmountPerPayment: env.MAX_AMOUNT_PER_PAYMENT,
      },
    ],
  });
  return client;
};

export type PaidResponse = {
  status: number;
  paymentStatus: string;
  /** 決済結果(txハッシュ・決済額など)。失敗時は理由 */
  payment: unknown;
  /** リソースの内容。外部サーバーの出力なので信頼しない */
  body: unknown;
};

/**
 * x402のリソースを取得する。
 * 402なら署名して再送する
 */
export const fetchPaid = async (
  client: x402Client,
  url: string,
): Promise<Result<PaidResponse>> => {
  try {
    // fetchをラップして、402なら署名して再送する
    const response = await wrapFetchWithPayment(fetch, client)(url);
    const text = await response.text();
    const body = parseJson(text);

    // x402HTTPClientでレスポンスを解析する。402なら署名して再送する
    const result = new x402HTTPClient(client).parsePaymentResult({
      status: response.status,
      getHeader: (name: string) => response.headers.get(name) ?? undefined,
      body,
    });

    return ok({
      status: response.status,
      paymentStatus: result.paymentStatus,
      payment: result.header,
      body: result.body,
    });
  } catch (error) {
    console.error("[x402] fetchPaid failed:", url, toMessage(error));
    return fail(toMessage(error));
  }
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    // JSONでなければそのまま文字列として扱う(長すぎる場合は切り詰める)
    return text.slice(0, 2000);
  }
};
