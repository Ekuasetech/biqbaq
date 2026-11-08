"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { groupResults, MIN_QUERY, resultHref, searchMyThings, type SearchResult } from "@/modules/dashboard-search";

/**
 * The top bar's search, for the person's own things (Q-56): a combobox listing results as
 * they type, grouped by kind. The database decides what each person can find.
 */
export function DashboardSearch({ className }: { className?: string }) {
  const t = useTranslations("dashboard.search");
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const latest = useRef(0);

  // Waits for a pause in typing, and ignores answers to older queries.
  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_QUERY) {
      const reset = setTimeout(() => setResults(null), 0);
      return () => clearTimeout(reset);
    }
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      const { data, error } = await searchMyThings(getSupabaseBrowserClient(), term);
      if (ticket !== latest.current) return;
      setResults(error ? [] : (data as SearchResult[]));
      setActive(-1);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const groups = groupResults(results ?? []);
  const flat = groups.flatMap((group) => group.items);
  const showList = open && query.trim().length >= MIN_QUERY && results !== null;
  const optionId = (index: number) => `${listId}-option-${index}`;

  function go(result: SearchResult) {
    setOpen(false);
    setQuery("");
    router.push(resultHref(result));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, flat.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = flat[active] ?? flat[0];
      if (chosen) go(chosen);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        role="combobox"
        aria-label={t("label")}
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
        autoComplete="off"
        maxLength={100}
        value={query}
        placeholder={t("placeholder")}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        className="h-10 w-full rounded-xl border border-input bg-background pr-3 pl-9 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
      />
      <div
        id={listId}
        role="listbox"
        aria-label={t("resultsLabel")}
        hidden={!showList}
        className="absolute top-full right-0 left-0 z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-lg"
      >
        {flat.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">{t("none", { query: query.trim() })}</p>}
        {groups.map((group) => (
          <div key={group.kind} role="group" aria-label={t(`kinds.${group.kind}`)} className="grid gap-0.5 py-1">
            <p aria-hidden className="px-3 pt-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t(`kinds.${group.kind}`)}</p>
            {group.items.map((result) => {
              const position = flat.indexOf(result);
              return (
                <div
                  key={`${result.kind}-${result.id}`}
                  id={optionId(position)}
                  role="option"
                  aria-selected={position === active}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => go(result)}
                  onMouseEnter={() => setActive(position)}
                  className={cn("cursor-pointer rounded-xl px-3 py-2 text-sm", position === active && "bg-muted")}
                >
                  <span className="block truncate font-medium">{result.title}</span>
                  {result.detail && result.detail !== result.title && (
                    <span className="block truncate text-xs text-muted-foreground">{detailText(result, t)}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Product states are stored as codes, so they are shown in words. */
function detailText(result: SearchResult, t: ReturnType<typeof useTranslations>) {
  if (result.kind === "product" && result.detail && t.has(`productStatus.${result.detail}`)) return t(`productStatus.${result.detail}`);
  return result.detail;
}
