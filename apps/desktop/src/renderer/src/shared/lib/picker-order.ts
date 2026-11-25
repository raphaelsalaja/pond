/**
 * Existing choices stay ahead of the row that creates a new name.
 * The first choice is the keyboard default, so Enter creates a name only
 * when nothing already matches.
 */
export function placeCreateOptionLast<TOption, TCreate>(
  options: ReadonlyArray<TOption>,
  create: TCreate | null,
): ReadonlyArray<TOption | TCreate> {
  return create === null || create === undefined
    ? options
    : [...options, create];
}
