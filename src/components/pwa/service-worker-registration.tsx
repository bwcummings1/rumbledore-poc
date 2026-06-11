"use client";

import { useEffect } from "react";

export function registerServiceWorker(): Promise<ServiceWorkerRegistration> | null {
  if (!("serviceWorker" in navigator)) {
    return null;
  }
  return navigator.serviceWorker.register("/sw.js");
}

/** Registers the offline app-shell worker. Production-only: a dev worker would
 * serve stale chunks and mask hot reloads. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      registerServiceWorker()?.catch(() => undefined);
    }
  }, []);
  return null;
}
