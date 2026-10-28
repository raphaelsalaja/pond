"use client";

import { CodeBlock } from "@pond/ui/code-block";

interface CodeProps {
  code: string;
  language?: string;
  className?: string;
}

/** `CodeBlock` keeps copy state, so server pages render it through this client boundary. */
export function Code({ code, language, className }: CodeProps) {
  return (
    <CodeBlock.Root code={code} language={language} className={className} />
  );
}
