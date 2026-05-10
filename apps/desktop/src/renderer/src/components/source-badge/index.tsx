import {
  IconArena,
  IconCosmos,
  IconDribbble,
  IconInstagram,
  IconPinterest,
  IconXTwitter,
} from "@pond/icons/social-media";
import type { IconComponent } from "@pond/icons/types";
import type { SVGProps } from "react";
import styles from "./styles.module.css";

export interface SourceMeta {
  label: string;
  background: string;
  foreground: string;
  Icon: IconComponent;
  ring?: boolean;
}

export const SOURCE_REGISTRY: Record<string, SourceMeta> = {
  twitter: {
    label: "X / Twitter",
    background: "var(--ds-brand-twitter)",
    foreground: "#ffffff",
    Icon: IconXTwitter,
  },
  x: {
    label: "X / Twitter",
    background: "var(--ds-brand-twitter)",
    foreground: "#ffffff",
    Icon: IconXTwitter,
  },
  cosmos: {
    label: "Cosmos",
    background: "var(--ds-brand-cosmos)",
    foreground: "#141414",
    Icon: IconCosmos,
    ring: true,
  },
  reddit: {
    label: "Reddit",
    background: "var(--ds-brand-reddit)",
    foreground: "#ffffff",
    Icon: RedditMark,
  },
  arena: {
    label: "Are.na",
    background: "var(--ds-brand-arena)",
    foreground: "#141414",
    Icon: IconArena,
    ring: true,
  },
  "are.na": {
    label: "Are.na",
    background: "var(--ds-brand-arena)",
    foreground: "#141414",
    Icon: IconArena,
    ring: true,
  },
  facebook: {
    label: "Facebook",
    background: "var(--ds-brand-facebook)",
    foreground: "#ffffff",
    Icon: FacebookMark,
  },
  instagram: {
    label: "Instagram",
    background:
      "radial-gradient(circle at 30% 110%, #ffd600 0%, #ff6930 30%, #fe3b36 50%, transparent 80%), radial-gradient(circle at 90% 110%, #1b9df5 0%, #7017ff 40%, #ed00c0 70%, #ff1b90 100%)",
    foreground: "#ffffff",
    Icon: IconInstagram,
  },
  pinterest: {
    label: "Pinterest",
    background: "var(--ds-brand-pinterest)",
    foreground: "#ffffff",
    Icon: IconPinterest,
  },
  tiktok: {
    label: "TikTok",
    background: "#000000",
    foreground: "#ffffff",
    Icon: TikTokMark,
  },
  youtube: {
    label: "YouTube",
    background: "#ff0000",
    foreground: "#ffffff",
    Icon: YouTubeMark,
  },
  dribbble: {
    label: "Dribbble",
    background: "var(--ds-brand-dribbble)",
    foreground: "#ffffff",
    Icon: IconDribbble,
  },
};

export function getSourceMeta(source: string): SourceMeta | undefined {
  return SOURCE_REGISTRY[source.toLowerCase()];
}

export function getSourceLabel(source: string): string {
  const meta = getSourceMeta(source);
  if (meta) return meta.label;
  return source.charAt(0).toUpperCase() + source.slice(1);
}

interface RootProps extends React.ComponentPropsWithoutRef<"span"> {
  source: string;
  "data-size"?: "sm" | "md" | "lg";
}

function Root({ source, style, title, ...props }: RootProps) {
  const meta = getSourceMeta(source);
  if (!meta) {
    return (
      <span
        aria-hidden
        title={title ?? source}
        data-fallback="true"
        className={styles.root}
        style={style}
        {...props}
      >
        {source.charAt(0).toUpperCase()}
      </span>
    );
  }
  const { Icon, background, foreground, ring } = meta;
  return (
    <span
      aria-hidden
      title={title ?? meta.label}
      data-ring={ring ? "true" : undefined}
      className={styles.root}
      style={{ background, color: foreground, ...style }}
      {...props}
    >
      <Icon className={styles.glyph} />
    </span>
  );
}

export const SourceBadge = {
  Root,
};

function RedditMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>Reddit</title>
      <path
        fill="currentColor"
        d="M28 16.06a3.36 3.36 0 0 0-5.7-2.42 16.5 16.5 0 0 0-9-2.85l1.53-7.2 5 1.06a2.4 2.4 0 1 0 .25-1.46l-5.6-1.18a.74.74 0 0 0-.88.57l-1.7 8a16.46 16.46 0 0 0-9.13 2.86 3.37 3.37 0 1 0-3.7 5.5 6.61 6.61 0 0 0-.07 1.05c0 5.34 6.21 9.66 13.87 9.66S26.74 25.55 26.74 20.21a6.6 6.6 0 0 0-.07-1.04 3.36 3.36 0 0 0 1.33-3.11ZM10.66 18.4a2.4 2.4 0 1 1 2.4 2.4 2.4 2.4 0 0 1-2.4-2.4Zm13.5 6.34A8.18 8.18 0 0 1 18.4 27a8.18 8.18 0 0 1-5.76-2.27.55.55 0 1 1 .77-.77A7.06 7.06 0 0 0 18.4 26a7.06 7.06 0 0 0 5-1.99.55.55 0 0 1 .77.77ZM21.07 20.8a2.4 2.4 0 1 1 2.4-2.4 2.4 2.4 0 0 1-2.4 2.4Z"
      />
    </svg>
  );
}

function FacebookMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>Facebook</title>
      <path
        fill="currentColor"
        d="M19.6 17h3.4l.6-4.2h-4V10c0-1.2.4-2 2.2-2H24V4.2c-.4-.06-1.85-.2-3.55-.2-3.5 0-5.9 2.13-5.9 6.05v3.75H10v4.2h4.55V28h5.05V17Z"
      />
    </svg>
  );
}

function TikTokMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>TikTok</title>
      <path
        fill="currentColor"
        d="M22.34 6.5a6.18 6.18 0 0 1-3.5-2.5h-3.7v15.65a3.6 3.6 0 1 1-2.55-3.45v-3.78a7.32 7.32 0 1 0 6.25 7.23V11.83a9.79 9.79 0 0 0 5.75 1.85V9.95a5.96 5.96 0 0 1-2.25-3.45Z"
      />
    </svg>
  );
}

function YouTubeMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>YouTube</title>
      <path
        fill="currentColor"
        d="M30 9.65c-.34-1.27-1.34-2.27-2.6-2.6C25.07 6.4 16 6.4 16 6.4s-9.07 0-11.4.65a3.65 3.65 0 0 0-2.6 2.6C1.34 12 1.34 16 1.34 16s0 4 .66 6.35c.34 1.27 1.34 2.27 2.6 2.6 2.33.65 11.4.65 11.4.65s9.07 0 11.4-.65a3.65 3.65 0 0 0 2.6-2.6C30.66 20 30.66 16 30.66 16s0-4-.66-6.35ZM13.07 20.45v-8.9L20.93 16l-7.86 4.45Z"
      />
    </svg>
  );
}
