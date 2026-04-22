import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { saves } from "@pond/schema/db";
import { db } from "@/lib/db/client";
import { enrichSave } from "@/lib/enrich";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Re-runs the enrichment + media-mirror pipeline for a single save.
 * Useful when:
 *   - a CDN URL we never managed to mirror has rotted (Instagram fbcdn, etc.)
 *   - the original mirror job failed (transient network)
 *   - the row was ingested before mirroring existed
 *
 * Idempotent: enrichSave skips fields that already have data and skips
 * mirroring URLs that already point to our blob bucket.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [row] = await db.select().from(saves).where(eq(saves.id, id)).limit(1);
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    await enrichSave(id);
  } catch (err) {
    console.warn("[pond] manual refresh failed", id, err);
    return NextResponse.json({ error: "enrich failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
