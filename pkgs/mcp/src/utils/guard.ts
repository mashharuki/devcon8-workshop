export type GuardEnv = {
  /** カンマ区切りで許可するOrigin。未設定ならOriginヘッダ付きのリクエストは全て拒否する */
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
 * /mcp を公開するための最低限の防御。
 * - Origin: ブラウザ経由(DNS rebinding等)のリクエストを拒否する。MCPクライアント(Claude Code等)はOriginを付けない
 * - レート制限: クライアントIPごとに、OTP送信の乱用を抑える
 * 拒否するなら Response を、通すなら undefined を返す
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
