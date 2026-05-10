import {
  IconChevronDownOutline18,
  IconFolder5Outline18,
  IconGlobe2Outline18,
  IconLabelOutline18,
} from "@pond/icons/outline";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, isTextOnlyTweet } from "@/components/card-thumb";
import { buildMediaUnits } from "@/pool/media";
import type { Save } from "@/pool/types";
import { pickAuthorAvatarUrl } from "@/pool/url";
import { descriptionMatchesTitle, pickAuthorColor } from "./helpers";
import { collectMetadataRows, collectPropertyRows, type PaneRow } from "./rows";
import styles from "./styles.module.css";

interface PaneProps extends React.ComponentPropsWithoutRef<"article"> {
  save: Save;
}

export function Pane({ save, className, ...props }: PaneProps) {
  const [descExpanded, setDescExpanded] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const cover = useMemo(() => buildMediaUnits(save)[0] ?? null, [save]);
  const textTweet = isTextOnlyTweet(save);
  const stats = useMemo(() => collectMetadataRows(save), [save]);
  const props2 = useMemo(() => collectPropertyRows(save), [save]);
  const avatarUrl = useMemo(() => pickAuthorAvatarUrl(save), [save]);
  const description = save.description?.trim() ?? "";
  const showDescription =
    description.length > 0 && !descriptionMatchesTitle(save);
  const hasLocalFile = save.files.length > 0;

  const [searchParams, setSearchParams] = useSearchParams();
  const openLightbox = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.set("focus", save.id);
    setSearchParams(next, { replace: false });
  }, [save.id, searchParams, setSearchParams]);

  const openOriginal = useCallback(() => {
    if (!save.url) return;
    void window.pond.openExternal(save.url);
  }, [save.url]);

  const revealLocal = useCallback(() => {
    if (!hasLocalFile) return;
    void window.pond.revealSave(save.id);
  }, [save.id, hasLocalFile]);

  return (
    <article
      className={[styles.preview, styles.pane, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {cover ? (
        <button
          type="button"
          className={styles["pane-cover"]}
          onClick={openLightbox}
          aria-label="Open media full screen"
        >
          <img
            src={cover.isVideo ? (cover.posterUrl ?? cover.url) : cover.url}
            alt=""
            className={styles["pane-cover-img"]}
          />
        </button>
      ) : textTweet ? (
        <div className={styles["pane-cover"]} data-text-tweet="true">
          <Card.Root save={save}>
            <Card.Tweet />
          </Card.Root>
        </div>
      ) : null}

      {save.title ? (
        <h2 className={styles["pane-title"]}>{save.title}</h2>
      ) : null}

      {save.author ? (
        <div className={styles["pane-author"]}>
          <span
            className={styles["pane-author-dot"]}
            style={{ background: pickAuthorColor(save.author) }}
            aria-hidden
          >
            {avatarUrl && !avatarBroken ? (
              <img
                src={avatarUrl}
                alt=""
                className={styles["pane-author-avatar"]}
                onError={() => setAvatarBroken(true)}
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            ) : null}
          </span>
          <span className={styles["pane-author-name"]}>{save.author}</span>
        </div>
      ) : null}

      <PaneButton
        icon={<IconGlobe2Outline18 width={12} height={12} />}
        label="Open Original"
        onClick={openOriginal}
        disabled={!save.url}
      />

      {showDescription ? (
        <PaneSection label="Description">
          <div
            className={styles["pane-description"]}
            data-clamped={descExpanded ? undefined : "true"}
          >
            {description}
          </div>
          {description.length > 200 ? (
            <button
              type="button"
              className={styles["pane-read-more"]}
              onClick={() => setDescExpanded((v) => !v)}
              aria-expanded={descExpanded}
            >
              <span>{descExpanded ? "Show Less" : "Read More"}</span>
              <IconChevronDownOutline18
                width={12}
                height={12}
                data-rotate={descExpanded ? "true" : undefined}
                className={styles["pane-read-more-icon"]}
              />
            </button>
          ) : null}
        </PaneSection>
      ) : null}

      <PaneButton
        icon={<IconLabelOutline18 width={12} height={12} />}
        label="Add Tags"
        onClick={() => {}}
      />

      {stats.length > 0 ? (
        <PaneSection label="Metadata">
          <PaneRowList rows={stats} />
        </PaneSection>
      ) : null}

      {props2.length > 0 ? (
        <PaneSection label="Properties">
          <PaneRowList rows={props2} />
          <PaneButton
            icon={<IconFolder5Outline18 width={12} height={12} />}
            label="View Local Save"
            onClick={revealLocal}
            disabled={!hasLocalFile}
          />
        </PaneSection>
      ) : null}
    </article>
  );
}

function PaneSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className={styles["pane-section"]}>
      <h3 className={styles["pane-section-header"]}>{label}</h3>
      {children}
    </section>
  );
}

function PaneRowList({ rows }: { rows: PaneRow[] }) {
  return (
    <div className={styles["pane-row-list"]}>
      {rows.map((row, idx) => (
        <div
          key={row.id}
          className={styles["pane-row"]}
          data-alt={idx % 2 === 1 ? "true" : undefined}
        >
          <span className={styles["pane-row-icon"]} aria-hidden>
            {row.icon}
          </span>
          <span className={styles["pane-row-label"]}>{row.label}</span>
          <span className={styles["pane-row-value"]}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function PaneButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={styles["pane-button"]}
      onClick={onClick}
      disabled={disabled}
    >
      <span className={styles["pane-button-icon"]} aria-hidden>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
