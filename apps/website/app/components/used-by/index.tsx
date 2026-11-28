import Image from "next/image";
import styles from "./styles.module.css";

/**
 * Companies whose people star Pond on GitHub, by the employer on their public profile; Lovable is
 * confirmed. Each wordmark comes from the company's own site (GitHub's from brand.github.com),
 * recoloured to one black so the row reads as a set. `size` is each mark's height in pixels, set
 * by eye so they carry the same weight; `width` and `height` are the SVG's own proportions.
 */
const COMPANIES = [
  { name: "Lovable", file: "lovable", width: 755, height: 129, size: 19 },
  { name: "OpenAI", file: "openai", width: 292, height: 78, size: 22 },
  { name: "Google", file: "google", width: 272, height: 92, size: 24 },
  {
    name: "Cloudflare",
    file: "cloudflare",
    width: 1130,
    height: 156,
    size: 22,
  },
  { name: "Shopify", file: "shopify", width: 500, height: 142.8, size: 26 },
  { name: "Notion", file: "notion", width: 892, height: 254, size: 25 },
  { name: "Spotify", file: "spotify", width: 823.46, height: 225.25, size: 26 },
  { name: "GitHub", file: "github", width: 416, height: 95, size: 24 },
];

function Marks({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className={styles.track} aria-hidden={hidden || undefined}>
      {COMPANIES.map((company) => (
        <li key={company.file} className={styles.item}>
          <Image
            className={styles.mark}
            src={`/companies/${company.file}.svg`}
            alt={hidden ? "" : company.name}
            width={Math.round((company.width / company.height) * company.size)}
            height={company.size}
            unoptimized
          />
        </li>
      ))}
    </ul>
  );
}

/** A label beside a row of company wordmarks that scrolls on its own, under the hero. */
export function UsedBy() {
  return (
    <section className={styles.root} aria-labelledby="used-by-title">
      <div className={styles.inner}>
        <h2 id="used-by-title" className={styles.label}>
          Used by people at
        </h2>
        <div className={styles.marquee}>
          <Marks />
          <Marks hidden />
        </div>
      </div>
    </section>
  );
}
