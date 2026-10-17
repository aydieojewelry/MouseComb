import { useDebouncedCallback } from "@tanstack/react-pacer";
import { useEffect, useState } from "react";

/** Local edits show at once; saving waits until the user pauses (TanStack Pacer). */
export function useDraft<T>(saved: T, save: (value: T) => void, wait = 300) {
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const debouncedSave = useDebouncedCallback(save, { wait });
  const change = (value: T) => {
    setDraft(value);
    debouncedSave(value);
  };
  return [draft, change] as const;
}
