import {
  AlertTriangle,
  ArrowLeft,
  Gauge,
  Landmark,
  Newspaper,
  PlugZap,
} from "lucide-react";
import {
  PublicationFrontLayout,
  PublicationMasthead,
  type PublicationStory,
} from "@/components/publication/front-view";
import type { LeagueFeedData, LeagueFeedItem } from "@/news";
import { buildPublicationFront } from "@/news/front";
import { LeagueRealtimeRefresh } from "@/realtime/client";

function sectionTag(item: LeagueFeedItem): string {
  return item.section.label;
}

function toStory({
  item,
  leagueId,
}: {
  item: LeagueFeedItem;
  leagueId: string;
}): PublicationStory {
  const href =
    item.scope === "league" && item.kind === "blog"
      ? `/leagues/${leagueId}/press/${item.contentItemId}`
      : item.scope === "central"
        ? `/news/articles/${item.contentItemId}`
        : undefined;

  return {
    byline: item.sourceLabel,
    dek: item.dek ?? item.summary,
    headline: item.title,
    href,
    hrefLabel:
      item.scope === "league" && item.kind === "blog"
        ? "Read post"
        : "Read story",
    id: `${item.scope}-${item.id}`,
    origin: item.scope === "league" && item.kind === "blog" ? "cast" : "source",
    publishedAt: item.publishedAt,
    reactions: item.reactions,
    relevanceReason: item.relevanceReason,
    sectionTag: sectionTag(item),
    sourceUrl: item.scope === "central" ? item.sourceUrl : undefined,
    thumbnailAlt: item.title,
    thumbnailUrl: item.thumbnailUrl,
  };
}

export function LeagueFeedView({ data }: { data: LeagueFeedData }) {
  const front = buildPublicationFront(data.items);
  const emptyTitle = data.activeSection
    ? `No ${data.activeSection.label} stories yet`
    : "No Press items yet";
  const filteredEmptyTitle = data.activeTag
    ? `No stories tagged ${data.activeTag}`
    : emptyTitle;
  const emptyBody = data.activeSection
    ? "This beat has no league stories or matched central news yet. The full Press front is still available."
    : "League posts and matched central stories will appear here after the cast publishes.";
  const sectionLabel = data.activeTag
    ? `Tagged ${data.activeTag}`
    : data.activeSection
      ? `${data.activeSection.label} section`
      : undefined;
  const navItems = [
    {
      active: !data.activeSection,
      href: `/leagues/${data.league.id}/press`,
      label: "Front",
    },
    ...data.sections.map((section) => ({
      active: data.activeSection?.id === section.id,
      href: `/leagues/${data.league.id}/press/${section.slug}`,
      label: section.label,
    })),
  ];
  const canManageEditorial = data.userRole !== "member";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <LeagueRealtimeRefresh
        channelKinds={["blog"]}
        leagueId={data.league.id}
      />
      <PublicationMasthead
        actions={[
          {
            href: `/leagues/${data.league.id}`,
            icon: <ArrowLeft data-icon="inline-start" />,
            label: "League home",
          },
          {
            href: `/news?leagueId=${data.league.id}`,
            icon: <Newspaper data-icon="inline-start" />,
            label: "Central news",
          },
          {
            href: `/leagues/${data.league.id}/lore`,
            icon: <Landmark data-icon="inline-start" />,
            label: "Lore",
          },
          ...(canManageEditorial
            ? [
                {
                  href: `/leagues/${data.league.id}/press/failures`,
                  icon: <AlertTriangle data-icon="inline-start" />,
                  label: "Failure queue",
                },
                {
                  href: `/leagues/${data.league.id}/press/usage`,
                  icon: <Gauge data-icon="inline-start" />,
                  label: "AI usage",
                },
                {
                  href: `/leagues/${data.league.id}/press/webhooks`,
                  icon: <PlugZap data-icon="inline-start" />,
                  label: "Webhooks",
                },
              ]
            : []),
        ]}
        deck={`${data.league.season} ${data.league.provider.toUpperCase()} fantasy football. Filed by the cast for ${data.userRole.replace("_", " ")} readers.`}
        eyebrow={
          data.activeSection ? "SECTION · LEAGUE DISPATCH" : "LEAGUE DISPATCH"
        }
        navAriaLabel="Press sections"
        navItems={navItems}
        sectionLabel={sectionLabel}
        title={`The ${data.league.name} Press`}
      />
      <PublicationFrontLayout
        compactOverflowLabel={
          data.activeSection
            ? `Older in ${data.activeSection.label}`
            : "Older dispatches"
        }
        empty={{
          actionHref: data.activeSection
            ? `/leagues/${data.league.id}/press`
            : undefined,
          actionLabel: "Open The Press",
          body: emptyBody,
          title: filteredEmptyTitle,
        }}
        lead={
          front.lead
            ? toStory({ item: front.lead, leagueId: data.league.id })
            : null
        }
        river={front.river.map((item) =>
          toStory({ item, leagueId: data.league.id }),
        )}
        secondaries={front.secondaries.map((item) =>
          toStory({ item, leagueId: data.league.id }),
        )}
      />
    </main>
  );
}
