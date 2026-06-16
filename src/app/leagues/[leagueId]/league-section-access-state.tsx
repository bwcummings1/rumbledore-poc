import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { LockedFeatureCard } from "@/components/ui/locked-feature-card";
import { cn } from "@/lib/utils";

export function LeagueSectionAccessState({
  body,
  title,
}: {
  body: string;
  title: string;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-4 px-4 py-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))]">
      <LockedFeatureCard
        action={
          <Link
            href="/onboarding/espn"
            className={cn(buttonVariants({ className: "w-fit" }))}
          >
            Connect ESPN
          </Link>
        }
        body={body}
        reason={
          <span className="inline-flex items-center gap-2">
            <ShieldAlert className="size-3" aria-hidden="true" />
            Access gate
          </span>
        }
        title={title}
      />
    </main>
  );
}
