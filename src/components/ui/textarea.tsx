"use client";

import {
  type ComponentPropsWithoutRef,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";

import { cn } from "@/lib/utils";
import { fieldControlClasses } from "./control-styles";

interface TextareaProps extends ComponentPropsWithoutRef<"textarea"> {
  readonly showCount?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      maxLength,
      onInput,
      rows = 3,
      showCount = false,
      value,
      ...props
    },
    ref,
  ) => {
    const innerRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

    useLayoutEffect(() => {
      autosize(innerRef.current);
    }, []);

    useLayoutEffect(() => {
      autosize(innerRef.current);
    });

    return (
      <span className="grid gap-1" data-slot="textarea-shell">
        <textarea
          className={cn(
            fieldControlClasses(),
            "min-h-24 max-h-96 resize-none overflow-y-auto",
            className,
          )}
          data-slot="textarea"
          maxLength={maxLength}
          onInput={(event) => {
            autosize(event.currentTarget);
            onInput?.(event);
          }}
          ref={innerRef}
          rows={rows}
          value={value}
          {...props}
        />
        {showCount && typeof maxLength === "number" ? (
          <span className="metric justify-self-end text-xs text-muted-foreground">
            {String(value ?? props.defaultValue ?? "").length}/{maxLength}
          </span>
        ) : null}
      </span>
    );
  },
);

Textarea.displayName = "Textarea";

function autosize(element: HTMLTextAreaElement | null) {
  if (!element) {
    return;
  }
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

export { Textarea };
export type { TextareaProps };
