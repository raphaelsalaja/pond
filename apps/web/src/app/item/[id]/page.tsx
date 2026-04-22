import Link from "next/link";
import { notFound } from "next/navigation";
import { getSave } from "@/lib/db/queries";
import { RefreshButton } from "@/components/refresh-button";
import {
  bestImage,
  bestVideo,
  getGallery,
  getVideoUrl,
  proxyMedia,
} from "@/lib/media";

export const dynamic = "force-dynamic";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const save = await getSave(id);
  if (!save) notFound();

  const img = save.blobUrl ?? save.mediaUrl;
  const videoUrl = getVideoUrl(save);
  const isVideo = save.mediaType === "video";
  const gallery = getGallery(save);
  const hasContent = Boolean(
    save.title || save.description || img || videoUrl || gallery,
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link
        href="/"
        className="text-sm text-[rgb(var(--muted))] hover:text-[rgb(var(--foreground))]"
      >
        ← back
      </Link>

      <article className="mt-6 space-y-6">
        {gallery && gallery.length > 1 ? (
          <div className="space-y-3">
            {gallery.map((item, i) => {
              const poster = bestImage(item);
              const video = bestVideo(item);
              return item.type === "video" && video ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  key={`${item.url}-${i}`}
                  src={proxyMedia(video) ?? video}
                  poster={poster}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full rounded-2xl border border-[rgb(var(--border))] bg-black"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${item.url}-${i}`}
                  src={poster}
                  alt={save.title ? `${save.title} (${i + 1})` : ""}
                  className="w-full rounded-2xl border border-[rgb(var(--border))]"
                />
              );
            })}
          </div>
        ) : isVideo && videoUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={proxyMedia(videoUrl) ?? videoUrl}
            poster={img ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-2xl border border-[rgb(var(--border))] bg-black"
          />
        ) : img && save.mediaType !== "link" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={save.title ?? ""}
            className="w-full rounded-2xl border border-[rgb(var(--border))]"
          />
        ) : null}

        <div>
          <div className="mb-2 flex items-center gap-2 text-xs text-[rgb(var(--muted))]">
            <span className="rounded-full border border-[rgb(var(--border))] px-2 py-0.5">
              {save.source}
            </span>
            <time dateTime={save.savedAt.toISOString()}>
              saved {save.savedAt.toLocaleString()}
            </time>
          </div>

          {save.title ? (
            <h1 className="text-2xl font-semibold leading-tight">
              {save.title}
            </h1>
          ) : null}

          {save.author ? (
            <p className="mt-1 text-sm text-[rgb(var(--muted))]">
              {save.author}
            </p>
          ) : null}

          {save.description ? (
            <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed">
              {save.description}
            </p>
          ) : null}

          {!hasContent ? (
            <p className="mt-4 text-sm text-[rgb(var(--muted))]">
              No preview available — the source page didn&apos;t expose any
              metadata to anonymous fetches. Open the original to view.
            </p>
          ) : null}

          <div className="mt-6 flex items-center gap-4">
            <a
              href={save.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm underline underline-offset-4"
            >
              Open original ↗
            </a>
            <RefreshButton id={save.id} />
          </div>
        </div>

        {save.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {save.tags.map((t) => (
              <li
                key={t}
                className="rounded-full border border-[rgb(var(--border))] px-2 py-0.5 text-xs"
              >
                {t}
              </li>
            ))}
          </ul>
        ) : null}
      </article>
    </main>
  );
}
