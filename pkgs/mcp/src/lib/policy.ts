import type { PrivyClient } from "@privy-io/node";
import {
  authorizationTypes,
  PERMIT2_ADDRESS,
  uptoPermit2WitnessTypes,
  x402UptoPermit2ProxyAddress,
} from "@x402/evm";

/**
 * Privyのポリシー(委任キーが署名できる範囲)を組み立てる。
 *
 * ALLOWルールだけで構成する(許可リスト方式)。
 * ethereum_typed_data_message 条件は、ポリシーの types がクライアントの署名リクエストと
 * 完全一致しないと false になる。ALLOWのみなら不一致は「どのルールにも一致しない=拒否」になり、
 * 安全側に倒れる(DENYルールだと素通りするので使わない)。
 */
export type PolicyInput = {
  chainId: number;
  /** 決済トークン(USDC)のアドレス */
  asset: string;
  /** 1回の署名で許可する最大額(atomic units) */
  maxAmount: string;
  /** 送金先として許可するアドレス */
  payees: string[];
};

// SDKの型に合わせる(条件の形がSDKと合っているかをコンパイルで検証する)
export type PolicyBody = Parameters<
  ReturnType<PrivyClient["policies"]>["create"]
>[0];
type Rule = PolicyBody["rules"][number];
type Condition = Rule["conditions"][number];

const toHex = (value: string): string => `0x${BigInt(value).toString(16)}`;

type DomainField = Extract<
  Condition,
  { field_source: "ethereum_typed_data_domain" }
>["field"];

type TypedDataTypes = Record<string, { name: string; type: string }[]>;

/** 
 * x402の型定数はreadonlyなので、ポリシーに渡せる変更可能な形にコピーする
 */
const toMutableTypes = (
  types: Record<string, readonly { name: string; type: string }[]>,
): TypedDataTypes =>
  Object.fromEntries(
    Object.entries(types).map(([key, fields]) => [
      key,
      fields.map((field) => ({ name: field.name, type: field.type })),
    ]),
  );

const domainCondition = (field: DomainField, value: string): Condition => ({
  field_source: "ethereum_typed_data_domain",
  field,
  operator: "eq",
  value,
});

const messageCondition = (
  types: TypedDataTypes,
  primaryType: string,
  field: string,
  operator: "eq" | "lte" | "in",
  value: string | string[],
): Condition => ({
  field_source: "ethereum_typed_data_message",
  typed_data: { types, primary_type: primaryType },
  field,
  operator,
  value,
});

/** 
 * uptoスキーム: Permit2(PermitWitnessTransferFrom)の署名
 */
const uptoRule = (input: PolicyInput): Rule => {
  const types = toMutableTypes(uptoPermit2WitnessTypes);
  const primary = "PermitWitnessTransferFrom";
  return {
    name: "x402 upto: Permit2 authorization within the cap",
    method: "eth_signTypedData_v4",
    action: "ALLOW",
    conditions: [
      domainCondition("chainId", String(input.chainId)),
      domainCondition("verifyingContract", PERMIT2_ADDRESS),
      messageCondition(
        types,
        primary,
        "spender",
        "eq",
        x402UptoPermit2ProxyAddress,
      ),
      messageCondition(types, primary, "permitted.token", "eq", input.asset),
      messageCondition(
        types,
        primary,
        "permitted.amount",
        "lte",
        toHex(input.maxAmount),
      ),
      messageCondition(types, primary, "witness.to", "in", input.payees),
    ],
  };
};

/** 
 * exactスキーム: ERC-3009(TransferWithAuthorization)の署名
 */
const exactRule = (input: PolicyInput): Rule => {
  const types = toMutableTypes(authorizationTypes);
  const primary = "TransferWithAuthorization";
  return {
    name: "x402 exact: ERC-3009 transfer within the cap",
    method: "eth_signTypedData_v4",
    action: "ALLOW",
    conditions: [
      domainCondition("chainId", String(input.chainId)),
      domainCondition("verifyingContract", input.asset),
      messageCondition(types, primary, "to", "in", input.payees),
      messageCondition(types, primary, "value", "lte", toHex(input.maxAmount)),
    ],
  };
};

/** 
 * 予算の承認(approve)のためのトランザクション署名: 決済トークンへの送信だけを許可
 */
const approveRule = (input: PolicyInput): Rule => ({
  name: "Sign transactions to the payment token only",
  method: "eth_signTransaction",
  action: "ALLOW",
  conditions: [
    {
      field_source: "ethereum_transaction",
      field: "to",
      operator: "eq",
      value: input.asset,
    },
    {
      field_source: "ethereum_transaction",
      field: "value",
      operator: "lte",
      value: "0",
    },
    {
      field_source: "ethereum_transaction",
      field: "chain_id",
      operator: "eq",
      value: String(input.chainId),
    },
  ],
});

/**
 * ポリシーを組み立てる。
 * x402のuptoスキームとexactスキームの両方を含む。
 * @param input 
 * @returns 
 */
export const buildPolicy = (input: PolicyInput): PolicyBody => ({
  version: "1.0",
  name: "x402 agent: capped payments to allowed payees",
  chain_type: "ethereum",
  rules: [uptoRule(input), exactRule(input), approveRule(input)],
});
