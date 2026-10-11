import {
  getChainId,
  getPayeeAddress,
  getPricing,
  getToken,
  type SharedEnv,
} from "@x402-sample/config";

// チェーン・トークン・価格は共有設定(pkgs/config/.env)から読み込む。
// 変数名の解釈は pkgs/config/src/index.ts にある
export type ServerEnv = SharedEnv & {
  FACILITATOR_URL: string;
};

/** 環境変数に不足や不正があればここで投げる(起動時に呼んで早く失敗させる) */
export const resolveServerConfig = (env: ServerEnv) => ({
  chainId: getChainId(env),
  payTo: getPayeeAddress(env),
  token: getToken(env),
  pricing: getPricing(env),
});

// x402に関する設定
export const createX402Config = (env: ServerEnv) => {
  const { chainId, payTo, token, pricing } = resolveServerConfig(env);
  // 決済トークンのEIP-712ドメイン。オンチェーンの name() / version() と一致させる必要がある
  const assetExtra = { name: token.name, version: token.version };

  return {
    "GET /weather": {
      accepts: [
        {
          scheme: "exact",
          price: {
            amount: pricing.weather,
            asset: token.address,
            extra: assetExtra,
          },
          network: chainId,
          payTo,
        },
      ],
      description:
        "Get real-time weather data including temperature, conditions, and humidity",
      mimeType: "application/json",
      // Bazaar discovery拡張(declareDiscoveryExtension)は付けない。
      // Workers上では検証時の ajv が new Function を使い、課金ルートがハングするため
    },
    "GET /usage": {
      accepts: [
        {
          scheme: "upto",
          price: {
            amount: pricing.usageMax,
            asset: token.address,
            extra: assetExtra,
          },
          network: chainId,
          payTo,
        },
      ],
      description:
        "Usage-based billing sample (upto): settles only the consumed units up to the authorized maximum",
      mimeType: "application/json",
    },
  };
};
