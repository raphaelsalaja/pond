import type { Metadata } from "next";
import { getChangelog } from "@/lib/changelog";
import { GITHUB_RELEASES_URL } from "@/lib/links";
import { POND_VERSION } from "@/lib/release";
import { Cta } from "../components/cta";
import { Frame } from "../components/frame";
import { PageHeader } from "../components/page-header";
import { ReleaseNotes } from "../components/release-notes";
import styles from "./styles.module.css";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Every Pond release, with what's new, improved, and fixed.",
};

export default async function ChangelogPage() {
  const entries = await getChangelog();
  return (
    <main>
      <PageHeader.Root>
        <PageHeader.Label>Changelog</PageHeader.Label>
        <PageHeader.Title>What's new in Pond.</PageHeader.Title>
        <PageHeader.Lede>
          Every release, newest first. Pond installs updates for you, so you
          already have the latest.
        </PageHeader.Lede>
        <PageHeader.Actions>
          <Cta href={GITHUB_RELEASES_URL} variant="soft" external>
            GitHub Releases
          </Cta>
        </PageHeader.Actions>
      </PageHeader.Root>
      <Frame.Section className={styles.list}>
        {entries.map((entry) => (
          <ReleaseNotes
            key={entry.version}
            entry={entry}
            href={`/changelog/${entry.version}`}
            video={entry.version === POND_VERSION}
          />
        ))}
      </Frame.Section>
    </main>
  );
}
