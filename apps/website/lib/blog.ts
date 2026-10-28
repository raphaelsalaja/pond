import type { MDXContent } from "mdx/types";
import IntroducingPond2, {
  post as introducingPond2,
} from "@/content/blog/introducing-pond-2.mdx";

export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  summary: string;
}

interface Post extends PostMeta {
  Content: MDXContent;
}

/** Newest first. Each post exports its own `post` metadata next to the MDX body. */
const POSTS: Post[] = [
  {
    slug: "introducing-pond-2",
    ...introducingPond2,
    Content: IntroducingPond2,
  },
];

export function getPosts(): PostMeta[] {
  return POSTS.map(({ slug, title, date, summary }) => ({
    slug,
    title,
    date,
    summary,
  }));
}

export function getPost(slug: string): Post | null {
  return POSTS.find((post) => post.slug === slug) ?? null;
}
