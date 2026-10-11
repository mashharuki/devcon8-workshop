import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fail, ok, type Result, toMessage } from "./result.js";
import {
  type WalletState,
  type WalletStore,
  walletStateSchema,
} from "./store.js";

const stateFile = (home: string | undefined): string =>
  join(home ?? join(homedir(), ".x402mcp"), "wallet.json");

/** 保存済みのウォレット情報を読む。未作成なら data は undefined */
export const loadWalletState = async (
  home: string | undefined,
): Promise<Result<WalletState | undefined>> => {
  const file = stateFile(home);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    const isMissing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return isMissing
      ? ok(undefined)
      : fail(`failed to read ${file}: ${toMessage(error)}`);
  }

  const parsed = walletStateSchema.safeParse(JSON.parse(raw));
  return parsed.success
    ? ok(parsed.data)
    : fail(`invalid wallet state file: ${file}`);
};

/** ウォレット情報を保存する(ディレクトリ 0700 / ファイル 0600) */
export const saveWalletState = async (
  home: string | undefined,
  state: WalletState,
): Promise<Result<null>> => {
  const file = stateFile(home);
  try {
    await mkdir(join(file, ".."), { recursive: true, mode: 0o700 });
    await writeFile(file, JSON.stringify(state, null, 2), { mode: 0o600 });
    await chmod(file, 0o600);
    return ok(null);
  } catch (error) {
    return fail(`failed to save ${file}: ${toMessage(error)}`);
  }
};

/** ローカルのファイルに保存するストア(stdio用) */
export const createFileStore = (home: string | undefined): WalletStore => ({
  load: () => loadWalletState(home),
  save: (state) => saveWalletState(home, state),
});
