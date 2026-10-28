import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChangelog, getChangelogEntry } from "@/lib/changelog";
import { POND_VERSION } from "@/lib/release";
import { Cta } from "../../components/cta";
import { DownloadCta } from "../../components/download-cta";
import { Frame } from "../../components/frame";
import { ReleaseNotes } from "../../components/release-notes";
import styles from "./styles.module.css";

export const dynamicParams = false;

export async function generateStaticParams() {
  const entries = await getChangelog();
  return entries.map((entry) => ({ version: entry.version }));
}

interface VersionPageProps {
  params: Promise<{ version: string }>;
}

export async function generateMetadata({
  params,
}: VersionPageProps): Promise<Metadata> {
  const entry = await getChangelogEntry((await params).version);
  if (!entry) return {};
  return {
    title: `Pond ${entry.version}`,
    description: entry.summary,
  };
}

export default async function VersionPage({ params }: VersionPageProps) {
  const entry = await getChangelogEntry((await params).version);
  if (!entry) notFound();
  return (
    <main>
      <Frame.Section spacing="lg">
        <ReleaseNotes entry={entry} video={entry.version === POND_VERSION} />
        <div className={styles.actions}>
          {entry.version === POND_VERSION ? <DownloadCta size="md" /> : null}
          <Cta href="/changelog" variant="soft">
            All Releases
          </Cta>
        </div>
      </Frame.Section>
    </main>
  );
}
