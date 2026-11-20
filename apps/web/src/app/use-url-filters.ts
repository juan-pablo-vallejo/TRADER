"use client";

// A screen's filters, kept in the address: a reload, the back button or a pasted link
// shows the same thing. Each filter is a string with a default; a filter at its default is
// left out of the address, so the plain address is the plain screen. Setting one replaces
// the history entry (a filter is not a page to go back through) and keeps the scroll.
// Consumed by the Hours screen first.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

export function readFilters<K extends string>(
  defaults: Record<K, string>,
  params: { get(name: string): string | null },
): Record<K, string> {
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as K[]) {
    const value = params.get(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

// The query string for some filters: those at their default are left out, the rest are in
// the defaults' own order, so the same filters always make the same address.
export function writeFilters<K extends string>(
  defaults: Record<K, string>,
  filters: Record<K, string>,
): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(defaults) as K[]) {
    if (filters[key] !== defaults[key]) params.set(key, filters[key]);
  }
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

export function useUrlFilters<K extends string>(
  defaults: Record<K, string>,
): [Record<K, string>, (change: Partial<Record<K, string>>) => void] {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const fromAddress = useMemo(() => readFilters(defaults, params), [defaults, params]);
  // A change shows at once, before the address has followed: a checkbox must not wait
  // for a navigation to look checked. When the address changes (the change landing, or
  // the back button) it is the truth again.
  const address = params.toString();
  const [ahead, setAhead] = useState<{ at: string; filters: Record<K, string> } | null>(
    null,
  );
  const filters = ahead !== null && ahead.at === address ? ahead.filters : fromAddress;
  const set = useCallback(
    (change: Partial<Record<K, string>>) => {
      // Every filter the address holds is kept, this screen's or another's.
      const kept = new URLSearchParams(params.toString());
      const next = { ...readFilters(defaults, params), ...change } as Record<K, string>;
      for (const key of Object.keys(defaults) as K[]) {
        if (next[key] === defaults[key]) kept.delete(key);
        else kept.set(key, next[key]);
      }
      const query = kept.toString();
      setAhead({ at: params.toString(), filters: next });
      router.replace(query === "" ? path : `${path}?${query}`, { scroll: false });
    },
    [defaults, params, path, router],
  );
  return [filters, set];
}
