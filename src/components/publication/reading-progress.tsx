"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ReadingProgressProps {
  readonly className?: string;
  readonly targetId: string;
}

function ReadingProgress({ className, targetId }: ReadingProgressProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;

    function update() {
      const target = document.getElementById(targetId);
      if (!target) {
        setProgress(0);
        return;
      }

      const rect = target.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const height = Math.max(target.scrollHeight, rect.height, 1);
      const viewport = Math.max(window.innerHeight, 1);
      const start = top - viewport * 0.2;
      const end = top + height - viewport * 0.6;
      const next =
        end <= start ? 100 : ((window.scrollY - start) / (end - start)) * 100;

      setProgress(Math.min(100, Math.max(0, Math.round(next))));
    }

    function schedule() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [targetId]);

  return (
    <div
      className={cn(
        "panel sticky top-14 z-20 mx-auto grid w-full max-w-[76ch] gap-1 border-primary/25 px-3 py-2 shadow-raised lg:top-16",
        className,
      )}
      data-slot="article-reading-progress"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow text-primary">Reading progress</span>
        <span className="metric text-xs text-muted-foreground">
          {progress}%
        </span>
      </div>
      <div
        aria-label="Reading progress"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress}
        className="h-1 overflow-hidden rounded-full bg-[var(--hair-2)]"
        role="progressbar"
      >
        <span
          className="block h-full rounded-full bg-primary shadow-[0_0_16px_var(--glow-lilac)] motion-safe:transition-[width] motion-reduce:transition-none"
          data-slot="article-reading-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export { ReadingProgress };
export type { ReadingProgressProps };
