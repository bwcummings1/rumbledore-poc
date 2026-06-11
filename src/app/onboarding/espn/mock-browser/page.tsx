export default function MockEspnBrowserPage() {
  return (
    <main className="flex h-full min-h-52 flex-col justify-between bg-background p-4 text-sm">
      <div>
        <p className="font-semibold text-foreground">ESPN</p>
        <p className="mt-2 text-muted-foreground">
          Mock login session active for the fixture account.
        </p>
      </div>
      <p className="rounded-control border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        NHS Alumni Annual · 2026 · ready
      </p>
    </main>
  );
}
