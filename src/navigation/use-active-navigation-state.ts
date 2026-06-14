"use client";

import { usePathname } from "next/navigation";
import { deriveActiveNavigationState } from "./scope";

export function useActiveNavigationState() {
  return deriveActiveNavigationState(usePathname());
}
