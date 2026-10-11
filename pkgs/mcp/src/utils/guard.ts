export type GuardEnv = {
  /** Comma-separated allowed origins. When unset, rejects every request that includes an Origin header. */
  ALLOWED_ORIGINS?: string;
  RATE_LIMITER: {
    limit: (options: { key: string }) => Promise<{ success: boolean }>;
  };
};

const parseOrigins = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

/**
 * Minimum safeguards for exposing /mcp.
 * - Origin: rejects browser-based requests such as DNS rebinding. MCP clients such as Claude Code omit Origin.
 * - Rate limiting: prevents OTP-send abuse per client IP.
 * Returns a Response when rejecting a request, or undefined when allowing it.
 */
export const guardRequest = async (
  request: Request,
  env: GuardEnv,
): Promise<Response | undefined> => {
  const origin = request.headers.get("Origin");
  if (origin !== null && !parseOrigins(env.ALLOWED_ORIGINS).includes(origin)) {
    return Response.json({ error: "origin not allowed" }, { status: 403 });
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await env.RATE_LIMITER.limit({ key: ip });
  if (!success) {
    return Response.json({ error: "rate limit exceeded" }, { status: 429 });
  }
  return undefined;
};
