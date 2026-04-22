"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RefreshButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const onClick = async () => {
    setDone(false);
    try {
      const res = await fetch(`/api/refresh/${id}`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      startTransition(() => {
        router.refresh();
        setDone(true);
      });
    } catch (err) {
      console.warn("[pond] refresh failed", err);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-sm text-[rgb(var(--muted))] underline underline-offset-4 hover:text-[rgb(var(--foreground))] disabled:opacity-50"
    >
      {pending
        ? "Refreshing…"
        : done
          ? "Refreshed ✓"
          : "Refresh media"}
    </button>
  );
}
