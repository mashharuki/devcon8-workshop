// pay_and_fetch で呼べるパス。x402 server のデモエンドポイントだけを許可する
export const PAYABLE_PATH = /^\/(weather|usage(\?units=\d{1,4})?)$/;
