import { useEffect, useState } from "react";

const MINUTE = 60_000;

/** Run times read to the minute, so this ticks on each minute boundary. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setTimeout(
      () => setNow(new Date()),
      MINUTE - (now.getTime() % MINUTE),
    );
    return () => clearTimeout(timer);
  }, [now]);
  return now;
}
