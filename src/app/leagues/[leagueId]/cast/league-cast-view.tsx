import { ArrowRight, Home, Radio, Rss } from "lucide-react";
import Link from "next/link";
import type { LeagueCastPresenceData } from "@/cast/league-cast";
import {
  CastActivityDigest,
  CastChatThread,
  CastInsightGrid,
  CastPersonaOrb,
  CastRoster,
} from "@/components/cast/cast-presence";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import { LeagueRealtimeRefresh } from "@/realtime/client";

export function LeagueCastView({
  data,
}: {
  readonly data: LeagueCastPresenceData;
}) {
  const enabledCount = data.personas.filter((card) => card.enabled).length;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <LeagueRealtimeRefresh leagueId={data.league.id} />
      <CastActivityDigest count={data.insights.length} />
      <header className="panel grid gap-5 overflow-hidden p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={enabledCount > 0 ? "live" : "neutral"}>
                {enabledCount} performing
              </StatusPill>
              <span className="eyebrow text-primary">AI cast</span>
            </div>
            <h1 className="heading-auspex mt-3 text-xl leading-tight">
              {data.league.name} Cast
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Six league-scoped personas, their latest reads, and the quiet
              thread of what they have already published for this league.
            </p>
          </div>
          <div className="bezel flex min-h-32 items-center justify-center rounded-card bg-primary/10 p-4">
            <div className="relative">
              <CastPersonaOrb
                label="The league cast is present"
                persona="commissioner"
                size="lg"
                state={enabledCount > 0 ? "speaking" : "muted"}
              />
              <span
                className="orb orb-sm absolute -right-5 bottom-0"
                data-persona="narrator"
                data-state="idle"
                aria-hidden="true"
              />
              <span
                className="orb orb-xs absolute -left-4 top-2"
                data-persona="analyst"
                data-state="idle"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/leagues/${data.league.id}`}
            className={cn(buttonVariants({ variant: "secondary" }))}
          >
            <Home data-icon="inline-start" />
            League home
          </Link>
          <Link
            href={`/leagues/${data.league.id}/press`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Rss data-icon="inline-start" />
            The Press
          </Link>
        </div>
      </header>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-primary">Roster</p>
            <h2 className="heading-auspex text-xl leading-tight">
              Persona dossiers
            </h2>
          </div>
          <StatusPill tone="neutral" variant="soft">
            read-only
          </StatusPill>
        </div>
        <CastRoster cards={data.personas} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,.8fr)]">
        <section className="grid content-start gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow text-primary">Reads</p>
              <h2 className="heading-auspex text-xl leading-tight">
                Insight cards
              </h2>
            </div>
            <Link
              href={`/leagues/${data.league.id}/press`}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            >
              Open archive
              <ArrowRight data-icon="inline-end" />
            </Link>
          </div>
          <CastInsightGrid
            empty={
              <EmptyState
                icon={<Radio className="size-4" />}
                title="No cast reads have posted yet."
              >
                <p>
                  This surface only renders league-scoped content that already
                  exists in The Press.
                </p>
              </EmptyState>
            }
            insights={data.insights}
          />
        </section>
        <aside className="grid content-start gap-3">
          <div>
            <p className="eyebrow text-primary">Thread</p>
            <h2 className="heading-auspex text-xl leading-tight">
              What the cast is saying
            </h2>
          </div>
          <CastChatThread turns={data.turns} />
        </aside>
      </div>
    </main>
  );
}
