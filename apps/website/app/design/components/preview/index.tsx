"use client";

import type { Example } from "@pond/ui/docs";
import { useId } from "react";
import { Doc } from "../doc";
import styles from "./styles.module.css";

interface PreviewProps extends React.ComponentPropsWithoutRef<"section"> {
  example: Example;
}

export function Preview({ example, ...props }: PreviewProps) {
  const id = useId();
  return (
    <Doc.Section aria-labelledby={id} {...props}>
      <Doc.Heading id={id}>{example.name}</Doc.Heading>
      <div className={styles.card}>
        <div className={styles.stage}>{example.render()}</div>
      </div>
    </Doc.Section>
  );
}
