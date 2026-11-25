import { Button } from "@pond/ui";
import type { ButtonProps } from "@pond/ui";
import { createLink } from "@tanstack/react-router";
import type { Ref } from "react";

interface ButtonAnchorProps extends Omit<
  ButtonProps,
  "render" | "nativeButton" | "ref"
> {
  href?: string;
  ref?: Ref<HTMLAnchorElement>;
}

/** Base UI defaults non-native buttons to `role="button"`; this one navigates. */
function ButtonAnchor({ href, ref, ...props }: ButtonAnchorProps) {
  return (
    <Button
      {...props}
      nativeButton={false}
      role="link"
      render={<a href={href} ref={ref} />}
    />
  );
}

/** Router `Link` with Pond `Button` chrome, for in-app navigation. */
export const ButtonLink = createLink(ButtonAnchor);
