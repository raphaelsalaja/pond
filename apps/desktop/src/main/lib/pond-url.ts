/**
 * `new URL` lowercases a host, but save ids are upper-case ULIDs and the
 * matching `.info` directory keeps that case. macOS and Windows hide the
 * mismatch with case-insensitive filesystems; Linux returns ENOENT, so every
 * id derived from a `pond://` host is restored to its stored spelling.
 */
export function canonicalPondSaveId(host: string): string {
  return host.toUpperCase();
}
