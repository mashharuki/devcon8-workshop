import type { SharedEnv } from "@x402-sample/config";

// Extend the Workers Env with shared configuration passed by the deploy/dev scripts through --var
declare global {
  interface Env extends SharedEnv {}
}
