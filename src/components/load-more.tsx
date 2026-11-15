"use client";

import * as React from "react";

import { useApp } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { format } from "@/lib/i18n";

/**
 * A count of items to show that grows by `step` on demand and starts over whenever `resetKey` changes (a new search,
 * sort, filter or view). Long lists render only what has been scrolled to, so the page stays fast as a vault grows.
 */
export function useVisibleCount(resetKey: string, step: number): [number, () => void] {
  const [state, setState] = React.useState({ key: resetKey, count: step });
  const count = state.key === resetKey ? state.count : step;
  const more = React.useCallback(() => setState({ key: resetKey, count: count + step }), [resetKey, count, step]);
  return [count, more];
}

/** Loads the next chunk when scrolled near, with a button as the keyboard / no-IntersectionObserver route. */
export function LoadMore({ remaining, step, onMore }: { remaining: number; step: number; onMore: () => void }) {
  const { t } = useApp();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || remaining <= 0 || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && onMore(), { rootMargin: "800px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [remaining, onMore]);

  if (remaining <= 0) return null;
  return (
    <div ref={ref} className="flex justify-center py-4">
      <Button variant="outline" onClick={onMore}>
        {format(t.common.showMore, { n: Math.min(step, remaining) })}
      </Button>
    </div>
  );
}
