import { IconCheck, IconChevronDown } from "@pond/icons";
import { ease, mix, progress } from "@pond/video";
import { REPORT } from "../data";
import { CUES } from "../timeline";
import styles from "./styles.module.css";

const WIDTH = 760;
const ZOOM = 1.5;
const TOP = 225;
const PICKED = 3;

/** Index of each section's first finding in the report's running count. */
const SECTION_STARTS: Array<number> = [];
let findingCount = 0;
for (const section of REPORT.sections) {
  SECTION_STARTS.push(findingCount);
  findingCount += section.findings.length;
}

/** The audit report for the download dialog, picking findings to fix. */
export function Audit({ t }: { t: number }) {
  const rise = ease.outQuint(progress(t, CUES.auditIn, 900));
  const away = ease.inOut(progress(t, CUES.auditOut, 420));
  if (t < CUES.auditIn - 20 || away >= 1) return null;

  const drift = ease.inOut(
    progress(t, CUES.findings, CUES.auditOut - CUES.findings),
  );
  const picks = Math.max(
    0,
    Math.min(PICKED, Math.floor((t - CUES.picks) / CUES.pickStep) + 1),
  );
  return (
    <div
      className={styles.stage}
      style={{
        left: (1920 - WIDTH * ZOOM) / 2,
        top: TOP - drift * 60,
        width: WIDTH * ZOOM,
        opacity: Math.min(1, rise * 2) * (1 - away),
        transform: `translateY(${(1 - rise) * 80}px) scale(${mix(1, 0.97, away)})`,
        filter: away > 0.01 ? `blur(${away * 8}px)` : undefined,
      }}
    >
      <div
        className={styles.report}
        style={{ width: WIDTH, transform: `scale(${ZOOM})` }}
      >
        <header className={styles.header}>
          <h1 className={styles.verdict}>{REPORT.verdict}</h1>
          <p className={styles.scope}>{REPORT.scope}</p>
        </header>
        <div className={styles.bar}>
          <span className={styles.filter}>
            All Severities {REPORT.total}
            <IconChevronDown size={12} />
          </span>
          <span className={styles.filter}>
            All Skills {REPORT.total}
            <IconChevronDown size={12} />
          </span>
          <span className={styles.copy} data-ready={picks > 0 || undefined}>
            Copy Picks
          </span>
        </div>
        {REPORT.sections.map((section, sectionIndex) => (
          <section key={section.title} className={styles.section}>
            <h2 className={styles.heading}>
              <span className={styles.name}>{section.title}</span>
              {section.description}
            </h2>
            <ol className={styles.findings}>
              {section.findings.map((finding, findingIndex) => {
                const index =
                  (SECTION_STARTS[sectionIndex] ?? 0) + findingIndex;
                const at = CUES.findings + index * CUES.findingStep;
                const k = ease.outQuint(progress(t, at, 520));
                const picked = index < picks;
                return (
                  <li
                    key={finding.title}
                    className={styles.finding}
                    style={{
                      opacity: Math.min(1, k * 1.6),
                      transform: `translateY(${(1 - k) * 12}px)`,
                    }}
                  >
                    <span className={styles.number}>{index + 1}</span>
                    <span className={styles.body}>
                      <span>{finding.title}</span>
                      <span className={styles.path}>{finding.path}</span>
                    </span>
                    <span
                      className={styles.pick}
                      data-picked={picked || undefined}
                    >
                      <IconCheck size={12} />
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
