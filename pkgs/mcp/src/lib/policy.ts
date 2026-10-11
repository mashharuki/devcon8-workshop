import type { PrivyClient } from "@privy-io/node";
import {
  authorizationTypes,
  PERMIT2_ADDRESS,
  uptoPermit2WitnessTypes,
  x402UptoPermit2ProxyAddress,
} from "@x402/evm";

/**
 * Builds the Privy policy that defines what the delegated key may sign.
 *
 * Uses ALLOW rules only (an allowlist model).
 * An ethereum_typed_data_message condition is false unless the policy's types exactly match the
 * client's signing request. With ALLOW-only rules, a mismatch means no rules match and the request
 * is rejected, which fails safely. A DENY rule would let a mismatch pass through, so none are used.
 */
export type PolicyInput = {
  chainId: number;
  /** Payment token (USDC) address. */
  asset: string;
  /** Maximum amount allowed per signature, in atomic units. */
  maxAmount: string;
  /** Addresses allowed as transfer destinations. */
  payees: string[];
};

// Match the SDK type so the compiler validates the condition structure
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
 * x402 type constants are readonly, so copy them into a mutable shape accepted by the policy.
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
 * upto scheme: Permit2 (PermitWitnessTransferFrom) signature.
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
 * exact scheme: ERC-3009 (TransferWithAuthorization) signature.
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
 * Transaction signing for budget approval (approve): allows calls only to the payment token.
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
 * Builds a policy that includes both the x402 upto and exact schemes.
 * @param input
 * @returns
 */
export const buildPolicy = (input: PolicyInput): PolicyBody => ({
  version: "1.0",
  name: "x402 agent: capped payments to allowed payees",
  chain_type: "ethereum",
  rules: [uptoRule(input), exactRule(input), approveRule(input)],
});
