import { Compass } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border bg-card shadow-lift">
        <Compass className="size-6 text-primary" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">This page doesn't exist</h1>
        <p className="max-w-sm text-sm text-muted-foreground">The link may be broken, or the page may have been moved.</p>
      </div>
      <Button asChild>
        <Link to="/">Take me home</Link>
      </Button>
    </div>
  );
}
