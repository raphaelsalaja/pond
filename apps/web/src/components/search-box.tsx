"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [value, setValue] = useState(initial);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set("q", value);
      else next.delete("q");
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `/?${qs}` : "/");
      });
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Search saves…"
      className="w-full max-w-sm rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 py-1.5 text-sm outline-none focus:border-[rgb(var(--foreground))]"
      type="search"
    />
  );
}
