import { cn } from "@pond/ui";
import styles from "./styles.module.css";

type InlineProps = React.ComponentPropsWithoutRef<"code">;

function Inline({ className, ...props }: InlineProps) {
  return <code className={cn(styles.code, className)} {...props} />;
}

interface TextProps {
  children: string;
}

/** Renders `backtick` spans from registry copy as inline code. */
function Text({ children }: TextProps) {
  const segments = children.split("`");
  const closed = segments.length % 2 === 1;
  let offset = 0;
  return segments.map((segment, index) => {
    const start = offset;
    offset += segment.length + 1;
    if (index % 2 === 0) {
      return segment;
    }
    if (!closed && index === segments.length - 1) {
      return `\`${segment}`;
    }
    return <Inline key={start}>{segment}</Inline>;
  });
}

export const Code = { Inline, Text };
