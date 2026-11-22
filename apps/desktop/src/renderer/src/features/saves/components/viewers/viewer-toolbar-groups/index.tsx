import { Tray } from "@pond/ui";
import type { ReactNode } from "react";

export interface ViewerNavigation {
  index: number;
  count: number;
  onPrevious: () => void;
  onNext: () => void;
}

interface ViewerToolbarGroupsProps {
  controls?: ReactNode;
  actions?: ReactNode;
  edits?: ReactNode;
  view?: ReactNode;
}

export function ViewerToolbarGroups({
  controls,
  actions,
  edits,
  view,
}: ViewerToolbarGroupsProps) {
  const rest = actions || edits || view;
  return (
    <>
      {controls}
      {controls && rest ? (
        <Tray.Separator role="separator" aria-hidden={false} />
      ) : null}
      {actions}
      {edits}
      {view}
    </>
  );
}
