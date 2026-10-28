"use client";

import { FishMark } from "../replica/fish-mark";
import type { FishColor, FishSpecies } from "../replica/fish-mark/types";
import styles from "./styles.module.css";

const SCHOOL: { name: string; species: FishSpecies; color: FishColor }[] = [
  { name: "Koi", species: "koi", color: "orange" },
  { name: "Goldie", species: "goldfish", color: "gold" },
  { name: "Puff", species: "puffer", color: "teal" },
  { name: "Nemo", species: "clownfish", color: "red" },
  { name: "Halo", species: "angelfish", color: "purple" },
  { name: "Fin", species: "shark", color: "blue" },
  { name: "Lumen", species: "anglerfish", color: "pink" },
  { name: "Sol", species: "sunfish", color: "green" },
];

/** The fish marks are client components, so the grid renders behind this boundary. */
export function FishSchool() {
  return (
    <ul className={styles.root}>
      {SCHOOL.map((fish) => (
        <li key={fish.species} className={styles.cell}>
          <span className={styles.tile}>
            <FishMark color={fish.color} species={fish.species} size={48} />
          </span>
          <span className={styles.name}>{fish.name}</span>
        </li>
      ))}
    </ul>
  );
}
