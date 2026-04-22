const HEADER = "authorization";
const PREFIX = "Bearer ";

/**
 * Validates the request's Authorization header against POND_INGEST_KEY.
 * Returns true on match. Constant-time comparison to avoid timing leaks.
 */
export function isAuthorized(req: Request): boolean {
  const expected = process.env.POND_INGEST_KEY;
  if (!expected) return false;

  const header = req.headers.get(HEADER);
  if (!header || !header.startsWith(PREFIX)) return false;

  const provided = header.slice(PREFIX.length);
  return constantTimeEqual(provided, expected);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
