import Image from "next/image";
import styles from "./styles.module.css";

/**
 * Companies whose people star Pond on GitHub, by the employer on their public profile; Lovable is
 * confirmed. Each wordmark comes from the company's own site (GitHub's from brand.github.com),
 * recoloured to one black so the row reads as a set. `size` is each mark's height in pixels, set
 * by eye so they carry the same weight; `width` and `height` are the SVG's own proportions.
 */
const COMPANIES = [
  { name: "Lovable", file: "lovable", width: 755, height: 129, size: 22 },
  { name: "OpenAI", file: "openai", width: 292, height: 78, size: 26 },
  { name: "Google", file: "google", width: 272, height: 92, size: 28 },
  {
    name: "Cloudflare",
    file: "cloudflare",
    width: 1130,
    height: 156,
    size: 26,
  },
  { name: "Shopify", file: "shopify", width: 500, height: 142.8, size: 30 },
  { name: "Notion", file: "notion", width: 892, height: 254, size: 30 },
  { name: "Spotify", file: "spotify", width: 823.46, height: 225.25, size: 30 },
  { name: "GitHub", file: "github", width: 416, height: 95, size: 28 },
];

/** A caption over a grid of company wordmarks, under the hero. */
export function UsedBy() {
  return (
    <section className={styles.root} aria-labelledby="used-by-title">
      <h2 id="used-by-title" className={styles.caption}>
        Used by people at
      </h2>
      <ul className={styles.grid}>
        {COMPANIES.map((company) => (
          <li key={company.file} className={styles.cell}>
            <Image
              className={styles.mark}
              src={`/companies/${company.file}.svg`}
              alt={company.name}
              width={Math.round(
                (company.width / company.height) * company.size,
              )}
              height={company.size}
              unoptimized
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
