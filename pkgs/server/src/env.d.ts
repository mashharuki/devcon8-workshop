import type { SharedEnv } from "@x402-sample/config";

// Workers の Env に、deploy / dev のスクリプトが --var で渡す共有設定の型を足す
declare global {
  interface Env extends SharedEnv {}
}
