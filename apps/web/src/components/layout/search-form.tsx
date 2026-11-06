"use client";

import { Car, LoaderCircle, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { getPathname, useRouter } from "@/i18n/navigation";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SearchSuggestion } from "@/modules/search";

const MIN_LENGTH = 2;
const DEBOUNCE_MS = 200;

interface Results {
  query: string;
  items: SearchSuggestion[];
  failed: boolean;
}

/**
 * A search box with live suggestions. It stays a plain GET form, so pressing
 * Enter searches even without JavaScript or if suggestions fail to load.
 */
export function SearchForm({ className, id }: { className?: string; id: string }) {
  const t = useTranslations("nav");
  const tCars = useTranslations("cargoCars");
  const locale = useLocale();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [results, setResults] = useState<Results | null>(null);

  const query = value.trim();
  const eligible = query.length >= MIN_LENGTH;
  const current = results?.query === query ? results : null;
  const loading = eligible && !current;

  useEffect(() => {
    if (!eligible) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/v1/search/suggestions?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Suggestions failed: ${response.status}`);
        const body: { data: SearchSuggestion[] } = await response.json();
        setResults({ query, items: body.data, failed: false });
      } catch {
        if (!controller.signal.aborted) setResults({ query, items: [], failed: true });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, eligible]);

  const items = current?.items ?? [];
  const products = items.filter((item) => item.type === "product");
  const cars = items.filter((item) => item.type === "car");
  // Keyboard order follows display order, with "see all results" last.
  const ordered = [...products, ...cars];
  const optionCount = current ? ordered.length + 1 : 0;
  const showList = open && eligible;
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  function close() {
    setOpen(false);
    setActive(-1);
  }

  function go(index: number) {
    const item = ordered[index];
    close();
    if (item) {
      setValue("");
      router.push(item.href);
    } else {
      router.push({ pathname: "/products", query: { q: query } });
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      close();
    } else if (showList && optionCount > 0 && event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % optionCount);
    } else if (showList && optionCount > 0 && event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index <= 0 ? optionCount - 1 : index - 1));
    } else if (event.key === "Enter" && showList && active >= 0) {
      event.preventDefault();
      go(active);
    }
  }

  const optionClass = (index: number) =>
    cn(
      "flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 text-left",
      index === active ? "bg-muted" : "hover:bg-muted",
    );

  function renderItem(item: SearchSuggestion, index: number) {
    return (
      <li
        key={item.id}
        id={optionId(index)}
        role="option"
        aria-selected={index === active}
        // Keeps focus in the input, so the list is not closed before the click lands.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => go(index)}
        onMouseEnter={() => setActive(index)}
        className={optionClass(index)}
      >
        <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {item.imageUrl ? (
            <Image src={item.imageUrl} alt="" fill sizes="44px" className="object-cover" />
          ) : (
            <Car className="size-4" aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{item.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
        </span>
        {item.type === "product" && (
          <span className="shrink-0 text-sm font-bold">{formatPrice(item.price, locale)}</span>
        )}
      </li>
    );
  }

  const groupLabel = "px-2 pt-2 pb-1 text-xs font-bold tracking-wide text-muted-foreground uppercase";

  return (
    <form
      role="search"
      action={getPathname({ href: "/products", locale })}
      className={cn("relative", className)}
    >
      <label htmlFor={id} className="sr-only">
        {t("searchLabel")}
      </label>
      {loading && showList ? (
        <LoaderCircle
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none"
          aria-hidden
        />
      ) : (
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      )}
      <Input
        id={id}
        name="q"
        type="search"
        maxLength={100}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
        placeholder={t("searchPlaceholder")}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onKeyDown={onKeyDown}
        className="h-11 rounded-full border-transparent bg-card pl-9 text-base text-foreground shadow-sm md:text-sm"
      />

      <div
        hidden={!showList}
        className="absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl bg-card p-2 shadow-xl ring-1 ring-border"
      >
        {loading && <p className="px-2 py-3 text-sm text-muted-foreground">{t("searching")}</p>}
        <ul id={listId} role="listbox" aria-label={t("suggestionsLabel")}>
          {products.length > 0 && (
            <li role="group" aria-label={t("products")}>
              <p aria-hidden className={groupLabel}>
                {t("products")}
              </p>
              <ul role="none">{products.map((item) => renderItem(item, ordered.indexOf(item)))}</ul>
            </li>
          )}
          {cars.length > 0 && (
            <li role="group" aria-label={tCars("title")}>
              <p aria-hidden className={groupLabel}>
                {tCars("title")}
              </p>
              <ul role="none">{cars.map((item) => renderItem(item, ordered.indexOf(item)))}</ul>
            </li>
          )}
          {current && (
            <li
              id={optionId(ordered.length)}
              role="option"
              aria-selected={active === ordered.length}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => go(ordered.length)}
              onMouseEnter={() => setActive(ordered.length)}
              className={cn(optionClass(ordered.length), "mt-1 text-sm font-semibold")}
            >
              <Search className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{t("seeAllResults", { query })}</span>
            </li>
          )}
        </ul>
        {current && !current.failed && ordered.length === 0 && (
          <p role="status" className="px-2 pt-2 text-sm text-muted-foreground">
            {t("noMatches", { query })}
          </p>
        )}
      </div>
    </form>
  );
}
