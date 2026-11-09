"use client";

import { useTranslations } from "next-intl";

const button =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";

/**
 * Previous and next pages for a list. `total` is how many items there are in all (the
 * database lists return it with each row); nothing shows when they fit on one page.
 */
export function Pager({ page, total, pageSize, onPage, label }: { page: number; total: number; pageSize: number; onPage: (page: number) => void; label?: string }) {
  const t = useTranslations("common.pager");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1 && page <= 1) return null;
  return (
    <nav aria-label={label ?? t("pagination")} className="flex flex-wrap items-center justify-center gap-3">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={button}>{t("previous")}</button>
      <span className="text-sm tabular-nums">{t("page", { page, pages: Math.max(pages, page) })}</span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={button}>{t("next")}</button>
    </nav>
  );
}
