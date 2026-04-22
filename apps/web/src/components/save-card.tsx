import Link from "next/link";
import type { Save } from "@pond/schema/db";
import { getGallery, getVideoUrl, proxyMedia } from "@/lib/media";

const SOURCE_LABEL: Record<string, string> = {
  twitter: "Twitter",
  instagram: "Instagram",
  pinterest: "Pinterest",
  arena: "Are.na",
  cosmos: "Cosmos",
};

export function SaveCard({ save }: { save: Save }) {
  const img = save.blobUrl ?? save.mediaUrl;
  const videoUrl = getVideoUrl(save);
  const isVideo = save.mediaType === "video";
  const gallery = getGallery(save);
  const galleryCount = gallery?.length ?? 0;

  return (
    <Link
      href={`/item/${save.id}`}
      className="group block overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] transition hover:-translate-y-0.5 hover:shadow-md"
    >
      {isVideo && videoUrl ? (
        <div className="relative bg-neutral-100 dark:bg-neutral-900">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={proxyMedia(videoUrl) ?? videoUrl}
            poster={img ?? undefined}
            preload="metadata"
            muted
            playsInline
            controls
            className="block w-full"
          />
          {galleryCount > 1 ? (
            <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
              1 / {galleryCount}
            </span>
          ) : null}
        </div>
      ) : img && save.mediaType !== "link" ? (
        <div className="relative bg-neutral-100 dark:bg-neutral-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt={save.title ?? ""}
            loading="lazy"
            className="block w-full"
          />
          {galleryCount > 1 ? (
            <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
              1 / {galleryCount}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="p-3">
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[rgb(var(--muted))]">
          <span>{SOURCE_LABEL[save.source] ?? save.source}</span>
          <time dateTime={save.savedAt.toISOString()}>
            {formatDate(save.savedAt)}
          </time>
        </div>

        {save.title ? (
          <h3 className="line-clamp-2 text-sm font-medium leading-snug">
            {save.title}
          </h3>
        ) : null}

        {save.description && !img ? (
          <p className="mt-1 line-clamp-3 text-xs text-[rgb(var(--muted))]">
            {save.description}
          </p>
        ) : null}

        {save.author ? (
          <p className="mt-2 text-[11px] text-[rgb(var(--muted))]">
            {save.author}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

function formatDate(d: Date) {
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return d.toLocaleDateString();
}
