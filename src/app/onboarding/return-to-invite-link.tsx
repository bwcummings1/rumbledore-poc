import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function returnToLabel(returnTo: string) {
  if (returnTo.startsWith("/invite/")) {
    return {
      action: "Return to invite",
      title: "League invite in progress",
    };
  }

  if (returnTo.startsWith("/leagues/")) {
    return {
      action: "Open saved league link",
      title: "League link saved",
    };
  }

  return {
    action: "Open saved link",
    title: "Destination saved",
  };
}

export function ReturnToInviteLink({ returnTo }: { returnTo?: string | null }) {
  if (!returnTo) {
    return null;
  }
  const label = returnToLabel(returnTo);

  return (
    <section className="rounded-control border border-primary/35 bg-primary/10 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">{label.title}</p>
        <Link
          href={returnTo}
          className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
        >
          {label.action}
          <ArrowRight data-icon="inline-end" />
        </Link>
      </div>
    </section>
  );
}
