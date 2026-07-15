import { ArrowLeft } from "lucide-react";
import {
  PublicationFrontLayout,
  PublicationMasthead,
  type PublicationStory,
} from "@/components/publication/front-view";
import { TabLinks } from "@/components/ui/tabs";
import { buildPublicationFront } from "@/news/front";
import type { CentralNewsHubData } from "@/news/hub";
import { CentralNewsRealtimeRefresh } from "@/realtime/client";

function toStory(item: CentralNewsHubData["items"][number]): PublicationStory {
  return {
    byline: item.source,
    dek: item.dek ?? item.summary,
    headline: item.title,
    href: `/news/articles/${item.id}`,
    hrefLabel: "Read story",
    id: item.id,
    origin: "source",
    publishedAt: item.publishedAt,
    sectionTag: item.section.label,
    sourceUrl: item.sourceUrl,
    thumbnailAlt: item.title,
    thumbnailUrl: item.thumbnailUrl,
  };
}

function toRailStory(
  item: NonNullable<CentralNewsHubData["forYourLeague"]>["items"][number],
): PublicationStory {
  return {
    byline: item.source,
    dek: item.dek ?? item.summary,
    headline: item.title,
    href: `/news/articles/${item.contentItemId}`,
    hrefLabel: "Read story",
    id: item.id,
    origin: "source",
    publishedAt: item.publishedAt,
    relevanceReason: item.relevanceReason,
    sectionTag: item.section.label,
    sourceUrl: item.sourceUrl,
    thumbnailAlt: item.title,
    thumbnailUrl: item.thumbnailUrl,
  };
}

function newsHref(path: string, leagueId: string | null | undefined): string {
  if (!leagueId) {
    return path;
  }

  return `${path}?leagueId=${encodeURIComponent(leagueId)}`;
}

function CentralPublicationNavigation({
  activeSection,
  branches,
  leagueId,
}: Pick<CentralNewsHubData, "activeSection" | "branches"> & {
  leagueId?: string | null;
}) {
  return (
    <section
      aria-label="Central publication branches"
      className="grid gap-3 lg:grid-cols-2"
      data-slot="central-publication-branches"
    >
      {branches.map((branch) => {
        const items = [
          ...(branch.id === "news"
            ? [
                {
                  active: !activeSection,
                  href: newsHref("/news", leagueId),
                  label: "Front",
                },
              ]
            : []),
          ...branch.sections.map((section) => ({
            active: activeSection?.id === section.id,
            href: newsHref(`/news/${section.slug}`, leagueId),
            label: section.label,
          })),
        ];

        return (
          <section
            aria-label={`${branch.label} branch`}
            className="grid min-w-0 gap-1"
            key={branch.id}
          >
            <p className="eyebrow text-muted-foreground">{branch.label}</p>
            <TabLinks ariaLabel={`${branch.label} sections`} items={items} />
          </section>
        );
      })}
    </section>
  );
}

export function NewsHubView({ data }: { data: CentralNewsHubData }) {
  const front = buildPublicationFront(data.items);
  const rail = data.forYourLeague;
  const emptyTitle = data.activeSection
    ? `No ${data.activeSection.label} stories yet`
    : "No central stories yet";
  const filteredEmptyTitle = data.activeTag
    ? `No stories tagged ${data.activeTag}`
    : emptyTitle;
  const emptyBody = data.activeSection
    ? "This section has no published stories yet. The rest of Rumbledore News is still available."
    : "The news refresh job has not published any shared headlines.";
  const activeBranch = data.activeSection
    ? (data.branches.find(
        (branch) => branch.id === data.activeSection?.branch,
      ) ?? null)
    : null;
  const sectionLabel = data.activeTag
    ? `Tagged ${data.activeTag}`
    : data.activeSection
      ? `${activeBranch?.label ?? "Central"} · ${data.activeSection.label}`
      : undefined;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <CentralNewsRealtimeRefresh />
      <PublicationMasthead
        actions={[
          {
            href: "/",
            icon: <ArrowLeft data-icon="inline-start" />,
            label: "Home",
          },
        ]}
        deck="Shared central news from the sport's feed. League-specific context appears only as a narrow rail when a league is active."
        eyebrow={
          data.activeSection ? "SECTION · RUMBLEDORE NEWS" : "CENTRAL WIRE"
        }
        navigation={
          <CentralPublicationNavigation
            activeSection={data.activeSection}
            branches={data.branches}
            leagueId={rail?.league.id}
          />
        }
        sectionLabel={sectionLabel}
        title="Rumbledore News"
      />
      <PublicationFrontLayout
        compactOverflowLabel={
          data.activeSection
            ? `Older in ${data.activeSection.label}`
            : "Older headlines"
        }
        empty={{
          actionHref: data.activeSection
            ? newsHref("/news", rail?.league.id)
            : undefined,
          actionLabel: "Open Rumbledore News",
          body: emptyBody,
          title: filteredEmptyTitle,
        }}
        lead={front.lead ? toStory(front.lead) : null}
        rail={
          rail
            ? {
                actionHref: `/leagues/${rail.league.id}/press`,
                actionLabel: "Read The Press",
                eyebrow: "For your league",
                stories: rail.items.map(toRailStory),
                title: `Central stories touching ${rail.league.name}`,
              }
            : null
        }
        river={front.river.map(toStory)}
        secondaries={front.secondaries.map(toStory)}
      />
    </main>
  );
}
