import type { ReactNode } from "react";
import { Skeleton as UiSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type MobileRouteSkeletonVariant =
  | "article"
  | "dashboard"
  | "invite"
  | "list"
  | "table";

export function MobileRouteSkeleton({
  variant = "dashboard",
}: {
  readonly variant?: MobileRouteSkeletonVariant;
}) {
  return SKELETON_VARIANTS[variant]();
}

const SKELETON_VARIANTS = {
  article: ArticleSkeleton,
  dashboard: DashboardSkeleton,
  invite: InviteSkeleton,
  list: ListSkeleton,
  table: TableSkeleton,
} satisfies Record<MobileRouteSkeletonVariant, () => ReactNode>;

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

function SkeletonPanel({
  children,
  className,
}: {
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <UiSkeleton
      className={cn("grid gap-4 p-4", className)}
      variant="card"
      data-slot="mobile-route-skeleton-panel"
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
