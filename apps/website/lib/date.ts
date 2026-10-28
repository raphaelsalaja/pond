const FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

/** Dates are calendar days (`2026-10-26`), so format in UTC to keep the day from shifting. */
export function formatDate(date: string): string {
  return FORMAT.format(new Date(`${date}T00:00:00Z`));
}
