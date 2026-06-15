import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ReturnToInviteLink({ returnTo }: { returnTo?: string | null }) {
  if (!returnTo) {
    return null;
  }

  return (
    <section className="rounded-control border border-primary/35 bg-primary/10 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">League invite in progress</p>
        <Link
          href={returnTo}
          className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
        >
          Return to invite
          <ArrowRight data-icon="inline-end" />
        </Link>
      </div>
    </section>
  );
}
