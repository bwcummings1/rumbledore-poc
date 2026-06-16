"use client";

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import type { ReactNode } from "react";

import { ToastViewport } from "./toast";

interface ToasterProps {
  readonly children?: ReactNode;
  readonly limit?: number;
  readonly timeout?: number;
}

function Toaster({ children, limit = 3, timeout = 5000 }: ToasterProps) {
  return (
    <ToastPrimitive.Provider limit={limit} timeout={timeout}>
      {children}
      <ToastViewport />
    </ToastPrimitive.Provider>
  );
}

export { Toaster };
export type { ToasterProps };
