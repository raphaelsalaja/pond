import type { HTMLAttributes, ReactNode, Ref } from "react";
import { Freeze } from "./index";

interface PopupTransitionState {
  transitionStatus?: "starting" | "ending" | "idle" | undefined;
}

type RenderFunctionProps = HTMLAttributes<HTMLDivElement> & {
  ref?: Ref<HTMLDivElement> | undefined;
  children?: ReactNode;
};

export function renderFrozenPopup(
  props: RenderFunctionProps,
  state: PopupTransitionState,
) {
  const { children, ...rest } = props;
  return (
    <div {...rest}>
      <Freeze frozen={state.transitionStatus === "ending"}>{children}</Freeze>
    </div>
  );
}
