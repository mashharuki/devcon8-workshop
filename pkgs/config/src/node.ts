import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/**
 * Loads the shared configuration file (pkgs/config/.env) into process.env (Node only).
 *
 * Reads the .env file in this package regardless of the current working directory.
 * Does not overwrite existing variables from a package-specific .env file or the shell.
 * Not used by Workers; the deploy/dev scripts pass the same values with --var.
 */
export const loadSharedEnv = (): void => {
  dotenv.config({
    path: fileURLToPath(new URL("../.env", import.meta.url)),
    quiet: true,
  });
};
