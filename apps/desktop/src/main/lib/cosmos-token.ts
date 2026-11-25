import { z } from "zod";

const OptionalId = z
  .union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)])
  .optional()
  .catch(undefined);

const CosmosTokenPayloadSchema = z
  .object({
    userId: OptionalId,
    user_id: OptionalId,
    uid: OptionalId,
    id: OptionalId,
    sub: OptionalId,
  })
  .catch({});

type CosmosTokenPayload = z.infer<typeof CosmosTokenPayloadSchema>;

export function cosmosIdentityFromToken(value: string): string | null {
  const payload = decodeCosmosToken(value);
  if (!payload) return null;
  const id =
    payload.userId ??
    payload.user_id ??
    payload.uid ??
    payload.id ??
    payload.sub;
  return id === undefined ? null : String(id);
}

function decodeCosmosToken(value: string): CosmosTokenPayload | null {
  const jwt = value.trim();
  const parts = jwt.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const json = Buffer.from(base64UrlToBase64(parts[1]), "base64").toString(
      "utf8",
    );
    const parsed = CosmosTokenPayloadSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function base64UrlToBase64(segment: string): string {
  const normalized = segment.replaceAll("-", "+").replaceAll("_", "/");
  const pad = normalized.length % 4;
  return pad === 0 ? normalized : normalized + "=".repeat(4 - pad);
}
