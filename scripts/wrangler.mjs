// wrangler dev / deploy に、共有設定(pkgs/config/.env)の値を --var で渡して実行する。
// 使い方(各パッケージの package.json から呼ぶ): node ../../scripts/wrangler.mjs <dev|deploy> [wranglerの引数...]
// Workers には .env が無いため、チェーン・トークン・価格をここで注入する。値は公開してよいものだけ。
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// 既定は pkgs/config/.env。別のファイルを使いたいとき(CIなど)は SHARED_ENV_FILE で指定する
const envPath =
  process.env.SHARED_ENV_FILE ??
  fileURLToPath(new URL("../pkgs/config/.env", import.meta.url));

const parseEnvFile = (text) =>
  Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const value = line
          .slice(index + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        return [line.slice(0, index).trim(), value];
      }),
  );

if (!existsSync(envPath)) {
  console.error(
    "pkgs/config/.env が見つかりません。`pnpm setup` を実行するか、pkgs/config/.env.example をコピーしてください",
  );
  process.exit(1);
}

const vars = parseEnvFile(readFileSync(envPath, "utf8"));
const varArgs = Object.entries(vars)
  .filter(([, value]) => value !== "")
  .flatMap(([key, value]) => ["--var", `${key}:${value}`]);

const [subcommand, ...rest] = process.argv.slice(2);
const result = spawnSync(
  "pnpm",
  ["exec", "wrangler", subcommand, ...varArgs, ...rest],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
