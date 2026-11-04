"use client";

import { BrandTile } from "@pond/ui";
import Image from "next/image";
import { type ReactNode, type RefObject, useRef } from "react";
import { findSave, saveImage } from "@/lib/library";
import { type Play, usePosterLoop } from "../../components/home/bento/play";

export type { Play };

import styles from "./styles.module.css";

const countFormat = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
  return countFormat.format(value);
}

export function visit(order: readonly number[], dwell = 760): Play<number> {
  return async (set, wait) => {
    await wait(480);
    for (const index of order) {
      set(index);
      await wait(dwell);
    }
  };
}

export function flip(poster: boolean, dwell = 1100): Play<boolean> {
  return async (set, wait) => {
    await wait(dwell);
    set(!poster);
    await wait(dwell);
    set(poster);
    await wait(420);
  };
}

export function countTo(from: number, to: number, step: number): Play<number> {
  return async (set, wait) => {
    await wait(700);
    for (let value = from; value < to; value += step) {
      set(value);
      await wait(36);
    }
    set(to);
    await wait(1400);
  };
}

export function useStage<S>(poster: S, play: Play<S>) {
  const ref = useRef<HTMLDivElement>(null);
  const state = usePosterLoop(poster, play, ref);
  return { ref, state };
}

export function Stage({
  nodeRef,
  size,
  mask,
  children,
}: {
  nodeRef: RefObject<HTMLDivElement | null>;
  size: "small" | "tall" | "wide";
  mask?: "bottom" | "right";
  children: ReactNode;
}) {
  return (
    <div
      ref={nodeRef}
      className={styles.stage}
      data-size={size}
      data-mask={mask}
      inert
    >
      {children}
    </div>
  );
}

export function Thumb({ id }: { id: string }) {
  const save = findSave(id);
  return (
    <span className={styles.shot}>
      <Image src={saveImage(save)} alt="" fill sizes="240px" />
    </span>
  );
}

export function Panel({
  place,
  fill = false,
  children,
}: {
  place: "start" | "end" | "bottom-start" | "bottom-end";
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={styles.panel}
      data-place={place}
      data-fill={fill || undefined}
    >
      {children}
    </div>
  );
}

export function AccountRow({
  icon,
  title,
  detail,
  on = false,
  done = false,
  trailing,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  on?: boolean;
  done?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <li
      className={styles.row}
      data-on={on || undefined}
      data-done={done || undefined}
    >
      <BrandTile size={40}>{icon}</BrandTile>
      <span className={styles.copy}>
        <strong>{title}</strong>
        <span className={styles.detail}>{detail}</span>
      </span>
      {trailing}
    </li>
  );
}
