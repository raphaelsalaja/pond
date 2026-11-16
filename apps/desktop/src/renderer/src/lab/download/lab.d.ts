import type { DetailedHTMLProps, HTMLAttributes } from "react";

type LabElement<T> = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> &
  T;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "lab-page": LabElement<{
        title?: string;
        root?: string;
        editor?: string;
      }>;
      "lab-entry": LabElement<{ force?: string }>;
    }
  }
}
