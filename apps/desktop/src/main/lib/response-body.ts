export async function readResponseBodyWithinBudget(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const declaredBytes = Number(response.headers.get("content-length") ?? 0);
  if (declaredBytes > maxBytes) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) {
    return null;
  }
  const chunks: Array<Uint8Array> = [];
  let byteLength = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    byteLength += chunk.value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }
  if (byteLength === 0) {
    return null;
  }
  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
