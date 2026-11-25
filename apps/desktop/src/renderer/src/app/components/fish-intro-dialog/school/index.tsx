import { cssVars } from "@pond/ui";
import type { FishColor, FishSpecies } from "@shared/fish-contracts";
import { useReducedMotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import { FishMark } from "@/features/fish";
import styles from "./styles.module.css";

const STEP_MS = 1800;

interface Member {
  color: FishColor;
  species: FishSpecies;
}

const OTHERS: ReadonlyArray<Member> = [
  { color: "gold", species: "goldfish" },
  { color: "teal", species: "puffer" },
  { color: "red", species: "clownfish" },
  { color: "purple", species: "angelfish" },
  { color: "blue", species: "shark" },
  { color: "green", species: "anglerfish" },
  { color: "pink", species: "sunfish" },
  { color: "orange", species: "koi" },
];

/** Signed slot distance from the center, so every fish keeps one element as it loops. */
function offsetOf(index: number, active: number, count: number): number {
  const ahead = (((index - active) % count) + count) % count;
  return ahead >= count / 2 ? ahead - count : ahead;
}

function useActive(count: number): number {
  const reduced = useReducedMotionConfig() ?? false;
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setStep((s) => s + 1), STEP_MS);
    return () => clearInterval(timer);
  }, [reduced]);

  return step % count;
}

export function School({ lead }: { lead: Member }) {
  const members = [
    lead,
    ...OTHERS.filter((member) => member.species !== lead.species),
  ];
  const active = useActive(members.length);
  const last = Math.ceil(members.length / 2) - 1;

  return (
    <div className={styles.school} aria-hidden="true">
      {members.map((member, index) => {
        const offset = offsetOf(index, active, members.length);
        return (
          <span
            key={member.species}
            className={styles.slot}
            data-active={offset === 0 || undefined}
            data-wrapped={offset === last || undefined}
            style={cssVars({ "--offset": offset })}
          >
            <FishMark
              color={member.color}
              species={member.species}
              mood={offset === 0 ? "pleased" : "calm"}
              size={40}
            />
          </span>
        );
      })}
    </div>
  );
}
