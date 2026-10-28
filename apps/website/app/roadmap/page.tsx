import type { Metadata } from "next";
import { GITHUB_ISSUES_URL, ROADMAP_URL } from "@/lib/links";
import { getRoadmap } from "@/lib/roadmap";
import { Cta } from "../components/cta";
import { Frame } from "../components/frame";
import { PageHeader } from "../components/page-header";
import styles from "./styles.module.css";

export const metadata: Metadata = {
  title: "Roadmap",
  description:
    "What's planned for Pond, including Linux, Safari, iPhone and iPad, more sources, and more imports.",
};

export default async function RoadmapPage() {
  const items = await getRoadmap();
  return (
    <main>
      <PageHeader.Root>
        <PageHeader.Label>Roadmap</PageHeader.Label>
        <PageHeader.Title>What's planned for Pond.</PageHeader.Title>
        <PageHeader.Lede>
          Items have no dates, and the order isn't a commitment. Open an issue
          to suggest something.
        </PageHeader.Lede>
        <PageHeader.Actions>
          <Cta href={GITHUB_ISSUES_URL} variant="soft" external>
            Suggest a Feature
          </Cta>
          <Cta href={ROADMAP_URL} variant="ghost" external>
            View on GitHub
          </Cta>
        </PageHeader.Actions>
      </PageHeader.Root>
      <Frame.Section spacing="sm">
        <ol className={styles.list}>
          {items.map((item, index) => (
            <li key={item.title} className={styles.item}>
              <span className={styles.index}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2 className={styles.title}>{item.title}</h2>
              <p className={styles.body}>
                {item.body.map((segment) =>
                  segment.kind === "link" ? (
                    <a
                      key={segment.href}
                      href={segment.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {segment.text}
                    </a>
                  ) : (
                    segment.text
                  ),
                )}
              </p>
            </li>
          ))}
        </ol>
      </Frame.Section>
    </main>
  );
}
