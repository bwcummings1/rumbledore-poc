"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { deriveActiveNavigationState } from "./scope";

/**
 * `deriveActiveNavigationState` returns a fresh object literal on every call,
 * and that object is the `activeState` the whole shell hangs off: it is a
 * dependency of the command-item, notification, and wire memos in
 * `NavigationShellView` and the identity `useShellRealtime` keys its
 * subscription set on. Unmemoised, every single shell render minted a new
 * `activeState`, so all of those memos missed and the realtime effect
 * re-evaluated — even when the pathname had not moved.
 *
 * The derivation is a pure function of the pathname, so memoising on the
 * pathname is exact, not an approximation.
 */
export function useActiveNavigationState() {
  const pathname = usePathname();

  return useMemo(() => deriveActiveNavigationState(pathname), [pathname]);
}
