/**
 * Existing choices stay ahead of the row that creates a new name.
 * The first choice is the keyboard default, so Enter creates a name only
 * when nothing already matches.
 */
export function placeCreateOptionLast<TOption, TCreate>(
  options: readonly TOption[],
  create: TCreate | null,
): readonly (TOption | TCreate)[] {
  return create == null ? options : [...options, create];
}
