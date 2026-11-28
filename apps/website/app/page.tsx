import { getLatestRelease } from "@/lib/release";
import { Faq } from "./components/faq";
import { Features } from "./components/features";
import { Footer } from "./components/footer";
import { Free } from "./components/free";
import { Hero } from "./components/hero";
import { Section } from "./components/section";
import { Showcase } from "./components/showcase";
import { SiteNav } from "./components/site-nav";
import { Sounds } from "./components/sounds";
import { Tools } from "./components/tools";
import { UsedBy } from "./components/used-by";
import { ASK, BUILD, FIND, FREE, KEEP, SAVE } from "./content/home";
import styles from "./styles.module.css";

export default async function Page() {
  const release = await getLatestRelease();
  return (
    <>
      <Sounds />
      <SiteNav release={release} />
      <main className={styles.page}>
        <Hero release={release} />
        <UsedBy />
        <div className={styles.sections}>
          <Section title={SAVE.title} line={SAVE.line}>
            <Features release={release} />
          </Section>
          <Section title={FIND.title} line={FIND.line} width="wide">
            <Showcase cards={FIND.cards} />
          </Section>
          <Section title={ASK.title} line={ASK.line} width="wide">
            <Showcase cards={ASK.cards} />
          </Section>
          <Section title={KEEP.title} line={KEEP.line} width="wide">
            <Showcase cards={KEEP.cards} />
          </Section>
          <Section title={BUILD.title} line={BUILD.line} width="wide">
            <Tools />
          </Section>
          <Section title={FREE.title} line={FREE.line} width="wide">
            <Free release={release} />
          </Section>
          <Faq />
        </div>
      </main>
      <Footer />
    </>
  );
}
