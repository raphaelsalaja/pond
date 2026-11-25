import { clsx as cn } from "clsx";

export type StateClassName<State> =
  | string
  | ((state: State) => string | undefined)
  | undefined;

/** Joins a base class with a UI SDK `className`, which may be a function of the part's state. */
export function withClass<State>(
  base: string | undefined,
  className: StateClassName<State>,
) {
  return className instanceof Function
    ? (state: State) => cn(base, className(state))
    : cn(base, className);
}
