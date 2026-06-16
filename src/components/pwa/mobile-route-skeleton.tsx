import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Skeleton as UiSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type MobileRouteSkeletonVariant =
  | "arena"
  | "article"
  | "dashboard"
  | "invite"
  | "list"
  | "publication"
  | "sportsbook"
  | "table";

export function MobileRouteSkeleton({
  variant = "dashboard",
}: {
  readonly variant?: MobileRouteSkeletonVariant;
}) {
  return SKELETON_VARIANTS[variant]();
}

const SKELETON_VARIANTS = {
  arena: ArenaSkeleton,
  article: ArticleSkeleton,
  dashboard: DashboardSkeleton,
  invite: InviteSkeleton,
  list: ListSkeleton,
  publication: PublicationSkeleton,
  sportsbook: SportsbookSkeleton,
  table: TableSkeleton,
} satisfies Record<MobileRouteSkeletonVariant, () => ReactNode>;

const arenaLeaderboardRows = [
  "rank-1",
  "rank-2",
  "rank-3",
  "rank-4",
  "rank-5",
  "rank-6",
  "rank-7",
  "rank-8",
] as const;

const arenaSnapshotTiles = [
  "leagues",
  "players",
  "top-league",
  "top-player",
] as const;

const arenaRivalryTiles = ["focus", "margin", "rival"] as const;

function ArenaLeaderboardSkeleton({ title }: { readonly title: string }) {
  return (
    <SkeletonPanel className="min-h-96">
      <div className="flex items-center justify-between gap-3">
        <div>
          <SkeletonLine className="h-3 w-24" />
          <SkeletonLine className="mt-2 h-5 w-44" />
        </div>
        <SkeletonLine className="h-7 w-20 rounded-full" />
      </div>
      <div className="grid gap-2">
        {arenaLeaderboardRows.map((row) => (
          <UiSkeleton
            className="h-14 rounded-control"
            data-slot="mobile-route-skeleton-row"
            key={`${title}-${row}`}
            variant="table-row"
          />
        ))}
      </div>
    </SkeletonPanel>
  );
}

function ArenaSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading arena"
      className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-5 sm:px-6 lg:px-8"
      data-slot="mobile-route-skeleton"
      data-variant="arena"
    >
      <section className="grid gap-4 rounded-card border border-border bg-card p-4 sm:p-5">
        <SkeletonLine className="h-10 w-24" />
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div>
            <SkeletonLine className="h-4 w-36" />
            <SkeletonLine className="mt-3 h-10 w-72 max-w-full" />
            <SkeletonLine className="mt-3 h-5 w-full max-w-2xl" />
            <SkeletonLine className="mt-2 h-5 w-80 max-w-full" />
          </div>
          <SkeletonPanel className="min-h-28" />
        </div>
      </section>

      <section
        aria-label="Arena snapshot loading"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {arenaSnapshotTiles.map((tile) => (
          <UiSkeleton key={tile} variant="stat-tile" />
        ))}
      </section>

      <SkeletonPanel className="min-h-96">
        <div className="flex items-center justify-between gap-3">
          <SkeletonLine className="h-6 w-56" />
          <SkeletonLine className="h-8 w-32 rounded-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {arenaRivalryTiles.map((tile) => (
            <UiSkeleton key={tile} variant="stat-tile" />
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)]">
          <SkeletonPanel className="min-h-56" />
          <SkeletonLine className="min-h-12 self-center" />
          <SkeletonPanel className="min-h-56" />
        </div>
      </SkeletonPanel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-6">
          <ArenaLeaderboardSkeleton title="League leaderboard" />
          <ArenaLeaderboardSkeleton title="Individual leaderboard" />
        </div>
        <section className="grid gap-3" aria-label="Rank movement loading">
          <SkeletonPanel className="min-h-44" />
          <SkeletonPanel className="min-h-44" />
        </section>
      </div>
    </main>
  );
}

function DashboardSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading Rumbledore"
      className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-5 sm:px-6 lg:px-8"
      data-slot="mobile-route-skeleton"
    >
      <section className="grid gap-3">
        <SkeletonLine className="h-4 w-24" />
        <SkeletonLine className="h-8 w-4/5 max-w-xl" />
        <SkeletonLine className="h-4 w-2/3 max-w-md" />
      </section>

      <section className="grid gap-3 md:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
        <SkeletonPanel className="min-h-52">
          <SkeletonLine className="h-5 w-36" />
          <div className="grid gap-3">
            <SkeletonLine className="h-14 w-full" />
            <SkeletonLine className="h-14 w-full" />
            <SkeletonLine className="h-14 w-full" />
          </div>
        </SkeletonPanel>

        <SkeletonPanel className="min-h-52">
          <SkeletonLine className="h-5 w-28" />
          <div className="grid grid-cols-2 gap-3">
            <SkeletonMetric />
            <SkeletonMetric />
            <SkeletonMetric />
            <SkeletonMetric />
          </div>
        </SkeletonPanel>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <SkeletonPanel className="min-h-36" />
        <SkeletonPanel className="min-h-36" />
        <SkeletonPanel className="min-h-36" />
      </section>
    </main>
  );
}

function SportsbookSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading sportsbook"
      className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-5 sm:px-6 lg:px-8"
      data-slot="mobile-route-skeleton"
      data-variant="sportsbook"
    >
      <section className="grid gap-4 rounded-card border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <SkeletonLine className="h-10 w-32" />
          <SkeletonLine className="h-7 w-24 rounded-full" />
        </div>
        <SkeletonLine className="h-4 w-28" />
        <SkeletonLine className="h-8 w-80 max-w-full" />
        <SkeletonLine className="h-4 w-full max-w-2xl" />
      </section>

      <SkeletonPanel className="min-h-64">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
          <div className="grid gap-3">
            <SkeletonLine className="h-4 w-32" />
            <SkeletonLine className="h-14 w-56 max-w-full" />
            <SkeletonLine className="h-3 w-full" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <UiSkeleton variant="stat-tile" />
            <UiSkeleton variant="stat-tile" />
            <UiSkeleton variant="stat-tile" />
          </div>
        </div>
      </SkeletonPanel>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
        <section className="grid gap-3" aria-label="Market board loading">
          {[0, 1, 2].map((event) => (
            <SkeletonPanel className="min-h-72" key={event}>
              <div className="flex items-center justify-between gap-3">
                <SkeletonLine className="h-5 w-44" />
                <SkeletonLine className="h-7 w-20 rounded-full" />
              </div>
              <div className="grid gap-3">
                <SkeletonLine className="h-14 w-full" />
                <SkeletonLine className="h-14 w-full" />
                <SkeletonLine className="h-14 w-full" />
              </div>
            </SkeletonPanel>
          ))}
        </section>
        <SkeletonPanel className="hidden min-h-96 lg:grid">
          <SkeletonLine className="h-4 w-36" />
          <SkeletonLine className="h-8 w-28" />
          <SkeletonLine className="h-16 w-full" />
          <SkeletonLine className="h-12 w-full" />
          <SkeletonLine className="h-12 w-full" />
        </SkeletonPanel>
      </div>
    </main>
  );
}

function ArticleSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading Rumbledore article"
      className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-6 sm:px-6 lg:px-8"
      data-slot="mobile-route-skeleton"
      data-variant="article"
    >
      <section className="grid gap-3">
        <SkeletonLine className="h-4 w-28" />
        <SkeletonLine className="h-9 w-11/12" />
        <SkeletonLine className="h-9 w-4/5" />
        <SkeletonLine className="h-4 w-56" />
      </section>
      <SkeletonPanel className="min-h-36" />
      <section className="grid gap-3" aria-hidden="true">
        <SkeletonLine className="h-4 w-full" />
        <SkeletonLine className="h-4 w-11/12" />
        <SkeletonLine className="h-4 w-10/12" />
        <SkeletonLine className="mt-3 h-4 w-full" />
        <SkeletonLine className="h-4 w-9/12" />
      </section>
    </main>
  );
}

function InviteSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading invite"
      className="grid min-h-dvh place-items-center bg-background px-4 py-8"
      data-slot="mobile-route-skeleton"
      data-variant="invite"
    >
      <section className="grid w-full max-w-md gap-4 rounded-card border border-border bg-card p-5">
        <SkeletonLine className="h-4 w-24" />
        <SkeletonLine className="h-8 w-4/5" />
        <SkeletonLine className="h-4 w-full" />
        <SkeletonLine className="h-12 w-full" />
        <SkeletonLine className="h-12 w-full" />
      </section>
    </main>
  );
}

function ListSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading stories"
      className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-5 sm:px-6 lg:px-8"
      data-slot="mobile-route-skeleton"
      data-variant="list"
    >
      <section className="grid gap-3">
        <SkeletonLine className="h-4 w-24" />
        <SkeletonLine className="h-8 w-72 max-w-full" />
      </section>
      <section className="grid gap-3 md:grid-cols-[minmax(0,1fr)_20rem]">
        <SkeletonPanel className="min-h-64">
          <SkeletonLine className="h-7 w-3/4" />
          <SkeletonLine className="h-4 w-5/6" />
          <SkeletonLine className="h-4 w-2/3" />
        </SkeletonPanel>
        <SkeletonPanel className="min-h-64" />
      </section>
      <section className="grid gap-3">
        <SkeletonLine className="h-16 w-full" />
        <SkeletonLine className="h-16 w-full" />
        <SkeletonLine className="h-16 w-full" />
      </section>
    </main>
  );
}

function TableSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading standings"
      className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-5 sm:px-6 lg:px-8"
      data-slot="mobile-route-skeleton"
      data-variant="table"
    >
      <section className="grid gap-3">
        <SkeletonLine className="h-4 w-28" />
        <SkeletonLine className="h-8 w-80 max-w-full" />
      </section>
      <SkeletonPanel className="min-h-72">
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-3" aria-hidden="true">
          <SkeletonLine className="h-4 w-full" />
          <SkeletonLine className="h-4 w-full" />
          <SkeletonLine className="h-4 w-full" />
        </div>
        <div className="grid gap-3" aria-hidden="true">
          <SkeletonLine className="h-12 w-full" />
          <SkeletonLine className="h-12 w-full" />
          <SkeletonLine className="h-12 w-full" />
          <SkeletonLine className="h-12 w-full" />
        </div>
      </SkeletonPanel>
    </main>
  );
}

function PublicationSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading publication"
      className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-5 sm:px-6 lg:px-8"
      data-slot="mobile-route-skeleton"
      data-variant="publication"
    >
      <section className="grid gap-4 rounded-card border border-border bg-card p-4 sm:p-5">
        <SkeletonLine className="h-4 w-32" />
        <SkeletonLine className="h-9 w-full max-w-xl sm:h-11" />
        <SkeletonLine className="h-5 w-full max-w-2xl" />
        <div className="flex gap-2 overflow-hidden">
          {[0, 1, 2, 3].map((item) => (
            <SkeletonLine className="h-11 w-28 shrink-0" key={item} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,8fr)_minmax(18rem,4fr)]">
        <SkeletonPanel className="min-h-80">
          <SkeletonLine className="aspect-[16/9] w-full" />
          <SkeletonLine className="h-4 w-24" />
          <SkeletonLine className="h-8 w-full max-w-2xl" />
          <SkeletonLine className="h-5 w-full max-w-xl" />
          <SkeletonLine className="h-10 w-32" />
        </SkeletonPanel>
        <section className="grid gap-3" aria-hidden="true">
          {[0, 1, 2].map((item) => (
            <SkeletonPanel className="min-h-48" key={item}>
              <SkeletonLine className="aspect-[16/9] w-full" />
              <SkeletonLine className="h-4 w-20" />
              <SkeletonLine className="h-6 w-full" />
              <SkeletonLine className="h-4 w-4/5" />
            </SkeletonPanel>
          ))}
        </section>
      </section>

      <section className="grid gap-3 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <SkeletonPanel className="min-h-52" key={item}>
            <SkeletonLine className="aspect-[16/9] w-full" />
            <SkeletonLine className="h-4 w-20" />
            <SkeletonLine className="h-6 w-full" />
            <SkeletonLine className="h-4 w-3/4" />
          </SkeletonPanel>
        ))}
      </section>
    </main>
  );
}

function SkeletonPanel({
  children,
  className,
  ...props
}: {
  readonly children?: ReactNode;
  readonly className?: string;
} & ComponentPropsWithoutRef<"div">) {
  return (
    <UiSkeleton
      className={cn("grid gap-4 p-4", className)}
      variant="card"
      data-slot="mobile-route-skeleton-panel"
      {...props}
    >
      {children ?? (
        <>
          <SkeletonLine className="h-5 w-32" />
          <SkeletonLine className="h-4 w-5/6" />
          <SkeletonLine className="h-4 w-2/3" />
        </>
      )}
    </UiSkeleton>
  );
}

function SkeletonMetric() {
  return (
    <div className="grid min-h-20 gap-2 rounded-control border border-border bg-background p-3">
      <SkeletonLine className="h-3 w-16" />
      <SkeletonLine className="h-6 w-20" />
    </div>
  );
}

function SkeletonLine({ className }: { readonly className?: string }) {
  return (
    <UiSkeleton
      className={className}
      data-slot="mobile-route-skeleton-line"
      variant="line"
    />
  );
}
