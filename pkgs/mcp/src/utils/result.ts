/** Result type for expected failures; exceptions are reserved for unexpected errors. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const fail = <T = never>(error: string): Result<T> => ({
  ok: false,
  error,
});

/**
 * Extracts a message from an unknown exception without including stack traces or secrets.
 */
export const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
