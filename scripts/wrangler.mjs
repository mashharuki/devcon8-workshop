// Run wrangler dev/deploy with values from the shared configuration (pkgs/config/.env) passed through --var.
// Usage (from each package.json): node ../../scripts/wrangler.mjs <dev|deploy> [wrangler arguments...]
// Workers do not have .env files, so inject the chain, token, and pricing here. Include only public values.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Defaults to pkgs/config/.env. Set SHARED_ENV_FILE to use another file, such as in CI
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
    "pkgs/config/.env was not found. Run `pnpm setup` or copy pkgs/config/.env.example.",
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
