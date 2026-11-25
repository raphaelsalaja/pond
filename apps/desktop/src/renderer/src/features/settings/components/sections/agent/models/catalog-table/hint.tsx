import { Tooltip } from "@pond/ui";
import type { ReactElement } from "react";

export function Hint({
  label,
  children,
}: {
  label?: string;
  children: ReactElement;
}) {
  if (!label) return children;
  return (
    <Tooltip label={label} side="top">
      {children}
    </Tooltip>
  );
}
