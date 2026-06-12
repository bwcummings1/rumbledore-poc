import { Newspaper, Plug, Trophy } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))]">
      <main className="flex max-w-md flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Rumbledore</h1>
        <p className="text-base text-muted-foreground">
          Your fantasy league&apos;s home base — a decade of history, records,
          league news, AI takes, and paper betting. Connect your league once;
          everything else follows.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href="/onboarding/espn"
            className={cn(buttonVariants({ className: "w-fit" }))}
          >
            <Plug data-icon="inline-start" />
            Connect ESPN
          </Link>
          <Link
            href="/onboarding/sleeper"
            className={cn(
              buttonVariants({ className: "w-fit", variant: "secondary" }),
            )}
          >
            <Plug data-icon="inline-start" />
            Connect Sleeper
          </Link>
          <Link
            href="/news"
            className={cn(
              buttonVariants({ className: "w-fit", variant: "outline" }),
            )}
          >
            <Newspaper data-icon="inline-start" />
            Central news
          </Link>
          <Link
            href="/arena"
            className={cn(
              buttonVariants({ className: "w-fit", variant: "outline" }),
            )}
          >
            <Trophy data-icon="inline-start" />
            Arena
          </Link>
        </div>
      </main>
    </div>
  );
}
