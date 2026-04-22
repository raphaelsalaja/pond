import { NextResponse } from "next/server";
import { after } from "next/server";
import { sql } from "drizzle-orm";
import { saves } from "@pond/schema/db";
import { ingestPayloadSchema } from "@pond/schema/ingest";
import { db } from "@/lib/db/client";
import { enrichSave } from "@/lib/enrich";
import { isAuthorized } from "@/lib/auth";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
};

function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return withCors(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return withCors(
      NextResponse.json({ error: "invalid json" }, { status: 400 }),
    );
  }

  const parsed = ingestPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return withCors(
      NextResponse.json(
        { error: "invalid payload", issues: parsed.error.flatten() },
        { status: 422 },
      ),
    );
  }
  const data = parsed.data;

  const [row] = await db
    .insert(saves)
    .values({
      source: data.source,
      sourceId: data.sourceId,
      url: data.url,
      title: data.title ?? null,
      description: data.description ?? null,
      author: data.author ?? null,
      mediaUrl: data.mediaUrl ?? null,
      mediaType: data.mediaType ?? null,
      tags: data.tags ?? [],
      savedAt: data.savedAt ?? new Date(),
      rawJson: (data.raw as Record<string, unknown> | undefined) ?? null,
    })
    .onConflictDoUpdate({
      target: [saves.source, saves.sourceId],
      set: {
        url: sql`excluded.url`,
        title: sql`coalesce(excluded.title, ${saves.title})`,
        description: sql`coalesce(excluded.description, ${saves.description})`,
        author: sql`coalesce(excluded.author, ${saves.author})`,
        mediaUrl: sql`coalesce(excluded.media_url, ${saves.mediaUrl})`,
        mediaType: sql`coalesce(excluded.media_type, ${saves.mediaType})`,
        tags: sql`excluded.tags`,
        rawJson: sql`coalesce(excluded.raw_json, ${saves.rawJson})`,
      },
    })
    .returning({
      id: saves.id,
      createdAt: saves.createdAt,
      savedAt: saves.savedAt,
    });

  if (!row) {
    return withCors(
      NextResponse.json({ error: "insert failed" }, { status: 500 }),
    );
  }

  // Enrichment runs after the response is sent so the extension never blocks.
  after(async () => {
    try {
      await enrichSave(row.id);
    } catch (err) {
      console.warn("[pond] enrich failed", row.id, err);
    }
  });

  const created = row.createdAt.getTime() === row.savedAt.getTime();
  return withCors(NextResponse.json({ id: row.id, created }));
}

export function GET() {
  return withCors(NextResponse.json({ ok: true }));
}
