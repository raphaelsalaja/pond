import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPost, getPosts } from "@/lib/blog";
import { formatDate } from "@/lib/date";
import { Cta } from "../../components/cta";
import { DownloadCta } from "../../components/download-cta";
import { Frame } from "../../components/frame";
import { Prose } from "../../components/prose";
import styles from "./styles.module.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return getPosts().map((post) => ({ slug: post.slug }));
}

interface PostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const post = getPost((await params).slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.summary,
    openGraph: { type: "article", publishedTime: post.date },
  };
}

export default async function PostPage({ params }: PostPageProps) {
  const post = getPost((await params).slug);
  if (!post) notFound();
  const { Content } = post;
  return (
    <main>
      <Frame.Section spacing="lg" className={styles.article}>
        <div className={styles.column}>
          <header className={styles.header}>
            <time className={styles.date} dateTime={post.date}>
              {formatDate(post.date)}
            </time>
            <h1 className={styles.title}>{post.title}</h1>
            <p className={styles.summary}>{post.summary}</p>
          </header>
          <Prose>
            <Content />
          </Prose>
          <footer className={styles.footer}>
            <DownloadCta size="md" />
            <Cta href="/blog" variant="soft">
              All Posts
            </Cta>
          </footer>
        </div>
      </Frame.Section>
    </main>
  );
}
