import "dotenv/config";
import {
  wrapAxiosWithPayment,
  type x402Client,
  x402HTTPClient,
} from "@x402/axios";
import axios, { type AxiosResponse } from "axios";
import { createPaymentClient } from "./config";

/**
 * uptoスキームのガードレール検証スクリプト
 *
 * 前提: facilitator / server を起動済みで、`pnpm x402client run approve <amount> --execute`
 *       でPermit2へのallowanceを設定済みであること。
 *
 * シナリオ:
 *   1. 上限内の使用量   → 使用量ぶんだけ決済される
 *   2. 上限を超える指定 → 支払いは送られるが、serverが上限超の決済を指定しても決済が成立しない
 *   3. client側の上限   → serverの認可上限がclientの許容額を超えるので、署名前(支払い送信前)に拒否される
 *
 * allowance不足の確認は `approve 0 --execute` で承認を取り消してから本スクリプトを実行する。
 *
 * 注意: @x402/axios は402を「axiosのエラー」として処理するため、validateStatusは上書きしない。
 */

type ScenarioResult =
  | { ok: true; detail: string }
  | { ok: false; detail: string };

// requests: axiosが送ったリクエスト数(1 = 初回のみ / 2 = 支払いを付けて再送した)
type UsageOutcome = { requests: number } & (
  | {
      kind: "response";
      status: number;
      paymentStatus: string;
      body: unknown;
      header: unknown;
    }
  | { kind: "client_error"; message: string }
);

const BASE_URL = process.env.PAYWALL_API_BASE_URL;

/** axiosのレスポンスから決済結果を取り出す */
const toResponseOutcome = (
  client: x402Client,
  response: AxiosResponse,
  requests: number,
): UsageOutcome => {
  const result = new x402HTTPClient(client).parsePaymentResult({
    status: response.status,
    getHeader: (name: string) => response.headers[name.toLowerCase()],
    body: response.data,
  });

  return {
    kind: "response",
    requests,
    status: response.status,
    paymentStatus: result.paymentStatus,
    body: result.body,
    header: result.header,
  };
};

/** 指定した上限のクライアントで /usage を呼び、結果を返す(想定内の失敗も例外にしない) */
const requestUsage = async (
  units: number,
  maxAmountPerPayment?: string,
): Promise<UsageOutcome> => {
  const client = createPaymentClient(maxAmountPerPayment);
  const api = wrapAxiosWithPayment(axios.create({ baseURL: BASE_URL }), client);

  let requests = 0;
  api.interceptors.request.use((config) => {
    requests += 1;
    return config;
  });

  try {
    const response = await api.get(`/usage?units=${units}`);
    return toResponseOutcome(client, response, requests);
  } catch (error) {
    // 支払いを付けて再送した後に失敗した場合(verify/settle失敗など)は、レスポンス付きのAxiosErrorになる
    if (axios.isAxiosError(error) && error.response) {
      return toResponseOutcome(client, error.response, requests);
    }
    // それ以外は署名前のclient側の拒否など("Failed to create payment payload: ...")
    const message = error instanceof Error ? error.message : String(error);
    return { kind: "client_error", requests, message };
  }
};

/** 1. 上限内: 3ユニット(0.3 USDC) <= 上限(0.5 USDC) */
const runWithinCap = async (): Promise<ScenarioResult> => {
  const res = await requestUsage(3);
  console.dir(res, { depth: null });

  const isSettled =
    res.kind === "response" &&
    res.status === 200 &&
    res.paymentStatus === "settled";
  return isSettled
    ? {
        ok: true,
        detail: "決済成立(settled)。決済額は header の amount を確認",
      }
    : { ok: false, detail: "決済が成立しなかった。上のログを確認" };
};

/** 2. 上限超過: 10ユニット(1.0 USDC) > 上限(0.5 USDC)。serverは丸めずに指定する */
const runOverCap = async (): Promise<ScenarioResult> => {
  const res = await requestUsage(10);
  console.dir(res, { depth: null });

  // 支払いが送られていない(requests < 2)場合は、上限で拒否されたのではないので成功扱いにしない
  const isPaymentSent = res.requests >= 2;
  if (!isPaymentSent) {
    return { ok: false, detail: "支払いが送られなかったため判定できない" };
  }
  if (res.kind !== "response") {
    return { ok: false, detail: `想定外のclientエラー: ${res.message}` };
  }
  if (res.paymentStatus === "settled") {
    return { ok: false, detail: "上限を超える決済が成立してしまった" };
  }

  // verify失敗(412: allowance不足など)を上限による拒否と取り違えないよう、理由まで確認する
  const errorReason = (res.header as { errorReason?: string } | undefined)
    ?.errorReason;
  return errorReason?.includes("settlement_exceeds_amount")
    ? { ok: true, detail: `上限超過で決済が拒否された: ${errorReason}` }
    : {
        ok: false,
        detail: `決済は成立しなかったが、上限超過が理由か確認できない (status ${res.status}, reason ${errorReason ?? "なし"})`,
      };
};

/** 3. client側の上限: 許容額(0.1 USDC)を、serverの認可上限(0.5 USDC)が超えている */
const runClientCap = async (): Promise<ScenarioResult> => {
  const res = await requestUsage(1, "100000");
  console.dir(res, { depth: null });

  // 初回のみ(requests === 1)で、client側のエラーになっていれば、署名前に拒否されている
  const isRejectedBeforeSigning =
    res.kind === "client_error" && res.requests === 1;
  return isRejectedBeforeSigning
    ? { ok: true, detail: `署名前に拒否された: ${res.message}` }
    : { ok: false, detail: "署名前に拒否されなかった" };
};

const scenarios: Array<[string, () => Promise<ScenarioResult>]> = [
  ["1. 上限内の使用量", runWithinCap],
  ["2. 上限を超える決済指定", runOverCap],
  ["3. client側の上限による拒否", runClientCap],
];

const main = async (): Promise<void> => {
  const summary: string[] = [];

  for (const [name, run] of scenarios) {
    console.log(`\n===== ${name} =====`);
    try {
      const result = await run();
      summary.push(
        `${result.ok ? "PASS" : "FAIL"}  ${name} - ${result.detail}`,
      );
    } catch (error) {
      console.error(`scenario error (${name}):`, error);
      summary.push(
        `ERROR ${name} - ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log("\n===== summary =====");
  console.log(summary.join("\n"));

  const hasFailure = summary.some((line) => !line.startsWith("PASS"));
  process.exit(hasFailure ? 1 : 0);
};

main();
