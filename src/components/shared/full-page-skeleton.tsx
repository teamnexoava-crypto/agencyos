import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the app shell layout so the first paint doesn't jump when the session resolves. */
export function FullPageSkeleton() {
  return (
    <div className="flex min-h-dvh bg-background" role="status" aria-label="Loading">
      <div className="hidden w-64 shrink-0 flex-col gap-2 border-r bg-sidebar p-4 lg:flex">
        <Skeleton className="mb-6 h-9 w-40" />
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 items-center justify-between border-b px-4 sm:px-6">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="size-9 rounded-full" />
        </div>
        <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-8">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
