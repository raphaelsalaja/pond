import {
  IconBrandArena,
  IconBrandBehance,
  IconBrandBluesky,
  IconBrandCosmos,
  IconBrandDribbble,
  IconBrandGithub,
  IconBrandMarked,
  IconBrandSavee,
  IconBrandSubstack,
  IconBrandThreads,
  IconBrandTumblr,
  IconBrandUnsplash,
  IconBrandVimeo,
  IconInstagram,
  IconPinterest,
  IconReddit,
  IconSourceLocal,
  IconSourceWeb,
  IconTikTok,
  IconXTwitter,
  IconYoutube,
} from "@pond/icons/social-media";
import type { IconComponent } from "@pond/icons/types";
import type { Source } from "@pond/schema/db";
import {
  hostToSource,
  resolveSourceId,
  sourceLabel,
} from "@pond/schema/sources";

interface SourceDef {
  source: Source;
  label: string;
  logo: string | null;
  icon: IconComponent | null;
}

const SOURCE_LOGOS = {
  twitter: null,
  pinterest: null,
  arena: null,
  instagram: null,
  cosmos: null,
  tiktok: null,
  youtube: null,
  reddit: null,
  threads: null,
  github: null,
  substack: null,
  tumblr: null,
  savee: null,
  behance: null,
  vimeo: null,
  dribbble: null,
  unsplash: null,
  bluesky: null,
  marked: null,
  web: null,
  local: null,
} satisfies Record<Source, string | null>;

const SOURCE_ICONS = {
  twitter: IconXTwitter,
  pinterest: IconPinterest,
  arena: IconBrandArena,
  instagram: IconInstagram,
  cosmos: IconBrandCosmos,
  tiktok: IconTikTok,
  youtube: IconYoutube,
  reddit: IconReddit,
  threads: IconBrandThreads,
  github: IconBrandGithub,
  substack: IconBrandSubstack,
  tumblr: IconBrandTumblr,
  savee: IconBrandSavee,
  behance: IconBrandBehance,
  vimeo: IconBrandVimeo,
  dribbble: IconBrandDribbble,
  unsplash: IconBrandUnsplash,
  bluesky: IconBrandBluesky,
  marked: IconBrandMarked,
  web: IconSourceWeb,
  local: IconSourceLocal,
} satisfies Record<Source, IconComponent | null>;

export function getSourceDef(source: Source): SourceDef {
  return {
    source,
    label: sourceLabel(source),
    logo: SOURCE_LOGOS[source],
    icon: SOURCE_ICONS[source],
  };
}

export function getSourceDefForIdentity(identity: string): SourceDef | null {
  const source =
    resolveSourceId(identity) ??
    hostToSource(identity.includes("://") ? identity : `https://${identity}`);
  return source ? getSourceDef(source) : null;
}

export function getSourceLogo(source: string): string | null {
  const normalized = resolveSourceId(source);
  return normalized ? SOURCE_LOGOS[normalized] : null;
}

export function getSourceIcon(source: string): IconComponent | null {
  const normalized = resolveSourceId(source);
  return normalized ? SOURCE_ICONS[normalized] : null;
}
