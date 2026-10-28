import type { Metadata } from "next";
import Link from "next/link";
import { getPosts } from "@/lib/blog";
import { formatDate } from "@/lib/date";
import { Frame } from "../components/frame";
import { PageHeader } from "../components/page-header";
import styles from "./styles.module.css";

export const metadata: Metadata = {
  title: "Blog",
  description: "Release stories and notes on how Pond is built.",
};

export default function BlogPage() {
  const posts = getPosts();
  return (
    <main>
      <PageHeader.Root>
        <PageHeader.Label>Blog</PageHeader.Label>
        <PageHeader.Title>Notes from the pond.</PageHeader.Title>
        <PageHeader.Lede>
          Release stories and notes on how Pond is built.
        </PageHeader.Lede>
      </PageHeader.Root>
      <Frame.Section spacing="sm">
        <ul className={styles.list}>
          {posts.map((post) => (
            <li key={post.slug}>
              <Link href={`/blog/${post.slug}`} className={styles.post}>
                <time className={styles.date} dateTime={post.date}>
                  {formatDate(post.date)}
                </time>
                <span className={styles.text}>
                  <span className={styles.title}>{post.title}</span>
                  <span className={styles.summary}>{post.summary}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Frame.Section>
    </main>
  );
}
