/** 想定内の失敗を表す結果型(例外は想定外のエラー専用) */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const fail = <T = never>(error: string): Result<T> => ({
  ok: false,
  error,
});

/**
 * unknown な例外からメッセージを取り出す(スタックや秘密情報は含めない)
 */
export const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
