import type { MetadataRoute } from "next";
import { getPosts } from "@/lib/blog";
import { getChangelog } from "@/lib/changelog";
import { SITE_URL } from "@/lib/links";

const PAGES = [
  "",
  "/sources",
  "/fish",
  "/download",
  "/integrations",
  "/developers",
  "/blog",
  "/changelog",
  "/roadmap",
  "/formats",
  "/brand",
  "/privacy",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const releases = await getChangelog();
  const latest = releases[0]?.date;
  return [
    ...PAGES.map((page) => ({
      url: `${SITE_URL}${page}`,
      lastModified: latest,
    })),
    ...getPosts().map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: post.date,
    })),
    ...releases.map((entry) => ({
      url: `${SITE_URL}/changelog/${entry.version}`,
      lastModified: entry.date,
    })),
  ];
}
