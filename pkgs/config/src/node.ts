import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/**
 * 共有設定ファイル(pkgs/config/.env)を process.env に読み込む(Node専用)
 *
 * cwdに依存せず、このパッケージ直下の .env を読む。
 * すでに設定されている環境変数(各パッケージの .env やシェルの値)は上書きしない。
 * Workers では使わない。Workers には deploy / dev のスクリプトが同じ値を --var で渡す。
 */
export const loadSharedEnv = (): void => {
  dotenv.config({
    path: fileURLToPath(new URL("../.env", import.meta.url)),
    quiet: true,
  });
};
