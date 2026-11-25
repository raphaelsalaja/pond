import { App, ease, mix, progress, scatter } from "@pond/video";
import { SCHOOL } from "../data";
import { CUES } from "../timeline";
import styles from "./styles.module.css";

/** A frame-filling school streams in from the left and swims on out to the right, leaving Koi. */
export function School({ t }: { t: number }) {
  if (t > CUES.schoolOut + 1400) return null;
  return (
    <div className={styles.school}>
      {SCHOOL.map((member, i) => {
        const lead = member.x / 1920;
        const enter = CUES.schoolIn + (1 - lead) * 520 + scatter(i + 40) * 380;
        const arrive = ease.outQuint(progress(t, enter, 1700));
        const out =
          CUES.schoolOut - 350 + (1 - lead) * 250 + scatter(i + 90) * 150;
        const leave = ease.in(progress(t, out, 750));
        if (arrive <= 0 || leave >= 1) return null;
        const reach = mix(0.75, 1.25, member.depth);
        const size = mix(40, 100, member.depth);
        const x =
          member.x -
          (1 - arrive) * 1500 * reach +
          leave * (1500 + size) * reach;
        const y =
          member.y +
          Math.sin(t / mix(1700, 1100, member.depth) + i * 1.7) *
            mix(6, 14, member.depth);
        return (
          <span
            key={`${member.x}-${member.y}`}
            className={styles.member}
            style={{
              opacity: Math.min(1, arrive * 2) * mix(0.5, 1, member.depth),
              transform: `translate(${x - size / 2}px, ${y - size / 2}px)`,
              filter:
                member.depth < 0.35
                  ? `blur(${(0.35 - member.depth) * 5}px)`
                  : undefined,
              zIndex: Math.round(member.depth * 10),
            }}
          >
            <App.Fish
              t={t}
              species={member.species}
              color={member.color}
              size={size}
              seed={i}
              busy={arrive < 0.9 || leave > 0}
            />
          </span>
        );
      })}
    </div>
  );
}
