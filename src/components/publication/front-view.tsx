import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  type TabButtonItem,
  type TabLinkItem,
  TabLinks,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { PublicationStory } from "./story";
import { PublicationStoryCard } from "./story-card";

export type { PublicationStory } from "./story";

export type PublicationNavItem = TabButtonItem | TabLinkItem;

export interface PublicationActionLink {
  href: string;
  icon?: ReactNode;
  label: string;
}

export interface PublicationRail {
  actionHref?: string;
  actionLabel?: string;
  eyebrow: string;
  stories: PublicationStory[];
  title: string;
}

export interface PublicationFrontEmptyState {
  actionHref?: string;
  actionLabel?: string;
  body: string;
  title: string;
}

interface PublicationMastheadProps {
  actions?: PublicationActionLink[];
  controls?: ReactNode;
  deck: string;
  eyebrow: string;
  navAriaLabel: string;
  navItems: PublicationNavItem[];
  sectionLabel?: string;
  title: string;
}

interface PublicationFrontLayoutProps {
  compactOverflowLabel?: string;
  empty: PublicationFrontEmptyState;
  lead: PublicationStory | null;
  rail?: PublicationRail | null;
  river: PublicationStory[];
  secondaries: PublicationStory[];
}

export function PublicationMasthead({
  actions = [],
  controls,
  deck,
  eyebrow,
  navAriaLabel,
  navItems,
  sectionLabel,
  title,
}: PublicationMastheadProps) {
  return (
    <header className="panel sticky top-14 z-10 grid gap-4 overflow-hidden border-x-0 px-4 py-4 shadow-raised backdrop-blur-xl motion-reduce:backdrop-blur-none sm:rounded-card sm:border-x sm:px-5 lg:top-16">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,var(--lilac),var(--amber),transparent)] opacity-70" />
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Link
            className={cn(
              buttonVariants({
                className: "w-fit",
                size: "sm",
                variant: "ghost",
              }),
            )}
            href={action.href}
            key={`${action.href}-${action.label}`}
          >
            {action.icon}
            {action.label}
          </Link>
        ))}
      </div>
      <div className="grid gap-2">
        <p className="eyebrow text-primary">{eyebrow}</p>
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,26rem)] lg:items-end">
          <div className="min-w-0">
            <h1 className="heading-auspex text-xl leading-tight">{title}</h1>
            {sectionLabel ? (
              <p className="metric mt-2 w-fit rounded-control border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary">
                {sectionLabel}
              </p>
            ) : null}
          </div>
          <p className="max-w-[58ch] text-sm leading-6 text-muted-foreground lg:text-right">
            {deck}
          </p>
        </div>
      </div>
      {controls ? (
        <div className="border-t border-[var(--hair)] pt-3">{controls}</div>
      ) : null}
      <TabLinks ariaLabel={navAriaLabel} items={navItems} />
    </header>
  );
}

export function PublicationFrontLayout({
  compactOverflowLabel = "Older stories",
  empty,
  lead,
  rail,
  river,
  secondaries,
}: PublicationFrontLayoutProps) {
  if (!lead) {
    return (
      <EmptyState
        action={
          empty.actionHref ? (
            <Link
              className={cn(
                buttonVariants({ className: "w-fit", variant: "outline" }),
              )}
              href={empty.actionHref}
            >
              {empty.actionLabel ?? "Open front"}
              <ArrowRight data-icon="inline-end" />
            </Link>
          ) : null
        }
        className="p-6 sm:p-8"
        title={empty.title}
      >
        {empty.body}
      </EmptyState>
    );
  }

  const compactOverflow = river.length > 6 ? river.slice(6) : [];
  const riverGrid = compactOverflow.length > 0 ? river.slice(0, 6) : river;

  return (
    <div className="grid gap-6" data-slot="publication-front">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,8fr)_minmax(18rem,4fr)] lg:items-start">
        <section aria-label="Lead story" data-front-tier="lead">
          <PublicationStoryCard story={lead} variant="hero" />
        </section>

        <div className="grid gap-4 lg:content-start">
          {rail && rail.stories.length > 0 ? (
            <PublicationRailBand rail={rail} />
          ) : null}
          {secondaries.length > 0 ? (
            <section
              aria-label="Secondary stories"
              className="grid gap-3"
              data-front-tier="secondary"
            >
              <TierHeading>Second deck</TierHeading>
              {secondaries.map((story) => (
                <PublicationStoryCard
                  key={story.id}
                  story={story}
                  variant="secondary"
                />
              ))}
            </section>
          ) : null}
        </div>
      </div>

      {river.length > 0 ? (
        <section
          aria-label="Story river"
          className="grid gap-3 border-t border-[var(--hair)] pt-5"
          data-front-tier="river"
        >
          <TierHeading>River</TierHeading>
          {riverGrid.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {riverGrid.map((story) => (
                <PublicationStoryCard
                  key={story.id}
                  story={story}
                  variant="river"
                />
              ))}
            </div>
          ) : null}
          {compactOverflow.length > 0 ? (
            <div className="cell grid gap-0 p-3" data-slot="compact-overflow">
              <p className="eyebrow mb-1 text-muted-foreground">
                {compactOverflowLabel}
              </p>
              {compactOverflow.map((story) => (
                <PublicationStoryCard
                  key={story.id}
                  story={story}
                  variant="compact"
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function PublicationRailBand({ rail }: { rail: PublicationRail }) {
  return (
    <section
      aria-label={rail.eyebrow}
      className="panel grid gap-3 border-primary/30 p-3"
      data-slot="publication-rail"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow text-primary">{rail.eyebrow}</p>
          <h2 className="font-display text-base font-medium text-foreground">
            {rail.title}
          </h2>
        </div>
        {rail.actionHref ? (
          <Link
            className={cn(
              buttonVariants({
                className: "w-fit",
                size: "sm",
                variant: "outline",
              }),
            )}
            href={rail.actionHref}
          >
            {rail.actionLabel ?? "Open"}
          </Link>
        ) : null}
      </div>
      <div className="grid gap-2">
        {rail.stories.map((story) => (
          <PublicationStoryCard key={story.id} story={story} variant="rail" />
        ))}
      </div>
    </section>
  );
}

function TierHeading({ children }: { children: ReactNode }) {
  return <p className="sr-only">{children}</p>;
}
