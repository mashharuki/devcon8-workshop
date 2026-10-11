import "dotenv/config";
import {
  wrapAxiosWithPayment,
  type x402Client,
  x402HTTPClient,
} from "@x402/axios";
import axios, { type AxiosResponse } from "axios";
import { createPaymentClient } from "./config";

/**
 * Guardrail validation script for the upto scheme.
 *
 * Prerequisites: the facilitator and server are running, and the Permit2 allowance has been set with
 * `pnpm x402client run approve <amount> --execute`.
 *
 * Scenarios:
 *   1. Usage within the cap -> only the amount used is settled.
 *   2. Amount above the cap -> payment is submitted, but settlement fails when the server requests too much.
 *   3. Client-side cap -> rejected before signing (and before payment submission) because the server's
 *      authorization cap exceeds the client's limit.
 *
 * To test insufficient allowance, revoke approval with `approve 0 --execute` before running this script.
 *
 * Note: @x402/axios handles 402 as an Axios error, so do not override validateStatus.
 */

type ScenarioResult =
  | { ok: true; detail: string }
  | { ok: false; detail: string };

// requests: number of requests sent by Axios (1 = initial request only / 2 = retried with payment)
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

/** Extracts the settlement result from an Axios response. */
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

/** Calls /usage with a client configured for the given cap and returns expected failures as values. */
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
    // A failure after retrying with payment (such as verify/settle failure) is an AxiosError with a response
    if (axios.isAxiosError(error) && error.response) {
      return toResponseOutcome(client, error.response, requests);
    }
    // Other failures include client-side rejection before signing ("Failed to create payment payload: ...")
    const message = error instanceof Error ? error.message : String(error);
    return { kind: "client_error", requests, message };
  }
};

/** 1. Within the cap: 3 units (0.3 USDC) <= cap (0.5 USDC). */
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
        detail: "Settlement succeeded. Check the amount in the header.",
      }
    : { ok: false, detail: "Settlement failed. Check the log above." };
};

/** 2. Above the cap: 10 units (1.0 USDC) > cap (0.5 USDC). The server does not clamp the amount. */
const runOverCap = async (): Promise<ScenarioResult> => {
  const res = await requestUsage(10);
  console.dir(res, { depth: null });

  // If payment was not sent (requests < 2), the cap did not cause the rejection, so do not count it as success
  const isPaymentSent = res.requests >= 2;
  if (!isPaymentSent) {
    return {
      ok: false,
      detail: "Cannot determine the result because payment was not sent.",
    };
  }
  if (res.kind !== "response") {
    return { ok: false, detail: `Unexpected client error: ${res.message}` };
  }
  if (res.paymentStatus === "settled") {
    return {
      ok: false,
      detail: "A settlement above the cap unexpectedly succeeded.",
    };
  }

  // Check the reason so a verify failure (such as 412 for insufficient allowance) is not mistaken for cap rejection
  const errorReason = (res.header as { errorReason?: string } | undefined)
    ?.errorReason;
  return errorReason?.includes("settlement_exceeds_amount")
    ? {
        ok: true,
        detail: `Settlement was rejected for exceeding the cap: ${errorReason}`,
      }
    : {
        ok: false,
        detail: `Settlement failed, but exceeding the cap could not be confirmed as the reason (status ${res.status}, reason ${errorReason ?? "none"})`,
      };
};

/** 3. Client-side cap: the server's authorization cap (0.5 USDC) exceeds the client limit (0.1 USDC). */
const runClientCap = async (): Promise<ScenarioResult> => {
  const res = await requestUsage(1, "100000");
  console.dir(res, { depth: null });

  // A client-side error after only the initial request (requests === 1) means rejection occurred before signing
  const isRejectedBeforeSigning =
    res.kind === "client_error" && res.requests === 1;
  return isRejectedBeforeSigning
    ? { ok: true, detail: `Rejected before signing: ${res.message}` }
    : { ok: false, detail: "The request was not rejected before signing." };
};

const scenarios: Array<[string, () => Promise<ScenarioResult>]> = [
  ["1. Usage within the cap", runWithinCap],
  ["2. Settlement request above the cap", runOverCap],
  ["3. Rejection by the client-side cap", runClientCap],
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
