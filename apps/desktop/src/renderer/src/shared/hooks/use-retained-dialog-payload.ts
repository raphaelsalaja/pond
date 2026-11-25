import { useState } from "react";

interface RetainedDialogPayload<Payload> {
  open: boolean;
  payload: Payload | null;
}

export function useRetainedDialogPayload<Payload>(
  active: Payload | null,
): RetainedDialogPayload<Payload> {
  const [retained, setRetained] = useState(active);
  if (active !== null && active !== retained) setRetained(active);
  return {
    open: active !== null,
    payload: active ?? retained,
  };
}
