import { IconCheck, IconCopy } from "@pond/icons";
import { Button } from "@pond/ui";
import { clsx as cn } from "clsx";
import { useState } from "react";
import type { ComponentPropsWithoutRef } from "react";
import styles from "./styles.module.css";

interface HeaderProps extends ComponentPropsWithoutRef<"div"> {
  code: string;
  language?: string;
}

function Header({ code, language, className, ...props }: HeaderProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const copied = copiedCode === code;
  const [error, setError] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setError(false);
    } catch {
      setError(true);
    }
  }
  return (
    <div className={cn(styles.header, className)} {...props}>
      <span>{language || "Code"}</span>
      <Button
        size="xs"
        variant="ghost"
        onClick={() => void copy()}
        aria-label="Copy Code"
      >
        {copied ? <IconCheck /> : <IconCopy />}
        {copied ? "Copied" : "Copy"}
      </Button>
      {error && <span role="status">Select the code to copy it</span>}
    </div>
  );
}

interface RootProps extends ComponentPropsWithoutRef<"div"> {
  code: string;
  language?: string;
}

function Root({ code, language, className, ...props }: RootProps) {
  return (
    <div className={cn(styles.root, className)} {...props}>
      <Header code={code} language={language} />
      <pre className={styles.pre} data-scroll-fade="horizontal">
        <code className={styles.code}>{code}</code>
      </pre>
    </div>
  );
}

export const CodeBlock = { Root, Header };
