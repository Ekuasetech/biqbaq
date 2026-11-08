"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { cardClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ADMIN_PAGE_SIZE,
  adminFindConversations,
  adminReadConversation,
  messagingErrorKey,
  type AdminConversation,
  type AdminMessage,
} from "@/modules/messaging";

const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";

/** Reading needs a reason, which goes in the audit log with who read it (Q-36). */
function ReadConversation({ conversation }: { conversation: AdminConversation }) {
  const t = useTranslations("messagesAdmin");
  const format = useFormatter();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [messages, setMessages] = useState<AdminMessage[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function read(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    if (!reason.trim()) {
      setFailure("reasonRequired");
      return;
    }
    setWorking(true);
    setFailure(null);
    const { data, error } = await adminReadConversation(getSupabaseBrowserClient(), conversation.id, reason.trim());
    setWorking(false);
    if (error) {
      setFailure(messagingErrorKey(error));
      return;
    }
    setMessages(data as AdminMessage[]);
    setAsking(false);
  }

  const tm = useTranslations("messaging");
  const errorText = (key: string) => (tm.has(`errors.${key}`) ? tm(`errors.${key}`) : tm("errors.generic"));

  if (messages) {
    return (
      <div className="mt-3 grid gap-2">
        <p className="text-xs text-muted-foreground">{t("recorded")}</p>
        <ol aria-label={t("messagesLabel")} className="grid gap-2">
          {messages.map((message) => (
            <li key={message.id} className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
              <p className="text-xs font-semibold text-muted-foreground">
                {t(message.sender_side === "buyer" ? "fromBuyer" : "fromShop", { name: message.sender_name })} ·{" "}
                {format.dateTime(new Date(message.created_at), { dateStyle: "medium", timeStyle: "short" })}
              </p>
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => setMessages(null)} className={`${secondaryButton} w-fit`}>{t("hide")}</button>
      </div>
    );
  }
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={`${secondaryButton} mt-3`}>{t("read")}</button>
    );
  }
  const field = `reason-${conversation.id}`;
  return (
    <form onSubmit={read} noValidate className="mt-3 grid gap-2">
      <Label htmlFor={field}>{t("reason")}</Label>
      <Input id={field} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} className="h-11 text-base md:text-sm" />
      <p className="text-xs text-muted-foreground">{t("reasonHint")}</p>
      {failure && <Notice kind="error">{errorText(failure)}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={working} className={primaryButton}>{t("confirmRead")}</button>
        <button type="button" onClick={() => setAsking(false)} className={secondaryButton}>{t("cancel")}</button>
      </div>
    </form>
  );
}

/** Super Admin's view of conversations: who wrote to which shop, and the text only on request. */
export function MessagesAdmin() {
  const t = useTranslations("messagesAdmin");
  const format = useFormatter();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminConversation[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminFindConversations(getSupabaseBrowserClient(), query, page);
    if (error) {
      setFailed(error.code === "42501" ? "notAllowed" : "loadFailed");
      return;
    }
    setFailed(null);
    setRows(data as AdminConversation[]);
  }, [query, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const total = rows?.[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
          setPage(1);
        }}
        className={`${cardClass} flex flex-wrap items-end gap-2`}
      >
        <div className="grid min-w-0 flex-1 gap-1.5">
          <Label htmlFor="conversation-search">{t("search")}</Label>
          <Input id="conversation-search" value={search} placeholder={t("searchPlaceholder")} onChange={(event) => setSearch(event.target.value)} className="h-11 text-base md:text-sm" />
        </div>
        <button type="submit" className={primaryButton}>{t("searchButton")}</button>
      </form>
      {failed && <Notice kind="error">{t(`errors.${failed}`)}</Notice>}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {rows && rows.length > 0 && (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.id}>
              <article aria-label={t("between", { buyer: row.buyer_name || row.buyer_email || "", shop: row.shop_name })} className={cardClass}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="break-words font-semibold">{t("between", { buyer: row.buyer_name || row.buyer_email || "", shop: row.shop_name })}</h2>
                    <p className="break-words text-sm text-muted-foreground">
                      {row.buyer_email} · {row.listing_name ?? t("aboutShop")} · {t("count", { count: row.message_count })} ·{" "}
                      {format.dateTime(new Date(row.last_message_at), { dateStyle: "medium" })}
                    </p>
                  </div>
                  <StatusPill tone={row.status === "open" ? "good" : "neutral"}>{t(`status.${row.status}`)}</StatusPill>
                </div>
                <ReadConversation conversation={row} />
              </article>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={secondaryButton}>{t("previous")}</button>
          <span className="text-sm text-muted-foreground">{t("page", { page, pages })}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={secondaryButton}>{t("next")}</button>
        </div>
      )}
    </div>
  );
}
