"use client";

import type { User } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { cardClass, Notice, primaryButton, StatusPill } from "@/components/account/account-dashboard";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  inReadingOrder,
  listConversations,
  listingPath,
  listMessages,
  markRead,
  MESSAGE_MAX,
  MESSAGES_PAGE_SIZE,
  messageSchema,
  messagingErrorKey,
  sendMessage,
  setArchived,
  setStatus,
  UNREAD_CHANGED,
  type Conversation,
  type Message,
} from "@/modules/messaging";

const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";

function useErrorText() {
  const t = useTranslations("messaging");
  return (key: string) => (t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.generic"));
}

/** Who the conversation is with, as each side should see it. */
function useTitle() {
  const t = useTranslations("messaging");
  return (conversation: Conversation) =>
    conversation.side === "buyer" ? conversation.shop_name : conversation.other_name || t("aCustomer");
}

function ConversationList({
  conversations,
  selected,
  archived,
}: {
  conversations: Conversation[];
  selected: string | null;
  archived: boolean;
}) {
  const t = useTranslations("messaging");
  const format = useFormatter();
  const title = useTitle();
  if (conversations.length === 0) {
    return <p className="p-2 text-sm text-muted-foreground">{t(archived ? "emptyArchive" : "empty")}</p>;
  }
  return (
    <ul aria-label={t("listLabel")} className="grid gap-1">
      {conversations.map((conversation) => {
        const href = `/account/messages?c=${conversation.id}${archived ? "&box=archived" : ""}`;
        return (
          <li key={conversation.id}>
            <Link
              href={href}
              prefetch={false}
              aria-current={conversation.id === selected ? "true" : undefined}
              className={cn(
                "grid gap-0.5 rounded-xl px-3 py-2.5 text-sm hover:bg-muted",
                conversation.id === selected && "bg-muted",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={cn("truncate", conversation.unread > 0 ? "font-bold" : "font-semibold")}>{title(conversation)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {format.relativeTime(new Date(conversation.last_message_at))}
                </span>
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {conversation.side === "seller" ? t("toShop", { shop: conversation.shop_name }) : null}
                {conversation.side === "seller" && conversation.listing_name ? " · " : null}
                {conversation.listing_name ?? (conversation.side === "buyer" ? t("aboutShop") : null)}
              </span>
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-muted-foreground">
                  {conversation.last_from_me ? `${t("you")}: ` : ""}
                  {conversation.last_body}
                </span>
                {conversation.unread > 0 && (
                  <span className="shrink-0 rounded-full bg-brand-red px-2 py-0.5 text-xs font-bold text-white">
                    <span className="sr-only">{t("unread", { count: conversation.unread })}</span>
                    <span aria-hidden>{conversation.unread}</span>
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Thread({
  conversation,
  version,
  archived,
  onChanged,
}: {
  conversation: Conversation;
  version: number;
  archived: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("messaging");
  const format = useFormatter();
  const errorText = useErrorText();
  const title = useTitle();
  const router = useRouter();
  const [pages, setPages] = useState<Message[][] | null>(null);
  const [more, setMore] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [working, setWorking] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const id = conversation.id;

  const loadLatest = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await listMessages(supabase, id);
    if (error) {
      setFailure(messagingErrorKey(error));
      return;
    }
    setPages([data as Message[]]);
    setMore((data as Message[]).length === MESSAGES_PAGE_SIZE);
    await markRead(supabase, id);
    window.dispatchEvent(new Event(UNREAD_CHANGED));
  }, [id]);

  // Reloads when the conversation changes, or Realtime reports something new in it.
  useEffect(() => {
    const timer = setTimeout(() => void loadLatest(), 0);
    return () => clearTimeout(timer);
  }, [loadLatest, version]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [pages]);

  async function loadEarlier() {
    const oldest = inReadingOrder(pages ?? [])[0];
    if (!oldest) return;
    const { data } = await listMessages(getSupabaseBrowserClient(), id, oldest.created_at);
    setPages([...(pages ?? []), (data ?? []) as Message[]]);
    setMore(((data ?? []) as Message[]).length === MESSAGES_PAGE_SIZE);
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (working) return;
    const parsed = messageSchema.safeParse(draft);
    if (!parsed.success) {
      setFailure(parsed.error.issues[0]?.message ?? "generic");
      return;
    }
    setWorking(true);
    setFailure(null);
    const { error } = await sendMessage(getSupabaseBrowserClient(), id, parsed.data);
    setWorking(false);
    if (error) {
      setFailure(messagingErrorKey(error));
      return;
    }
    setDraft("");
    await loadLatest();
    await onChanged();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void send();
  }

  async function act(action: () => PromiseLike<{ error: { code?: string; message?: string } | null }>) {
    setFailure(null);
    const { error } = await action();
    if (error) setFailure(messagingErrorKey(error));
    await onChanged();
  }

  const supabase = getSupabaseBrowserClient();
  const link = listingPath(conversation);
  const messages = inReadingOrder(pages ?? []);
  const closed = conversation.status === "closed";

  return (
    <section aria-label={t("threadLabel", { name: title(conversation) })} className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={archived ? "/account/messages?box=archived" : "/account/messages"} className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground lg:hidden">
            <ArrowLeft className="size-4" aria-hidden /> {t("back")}
          </Link>
          <h2 className="break-words font-heading text-xl font-extrabold tracking-tight">{title(conversation)}</h2>
          <p className="text-sm text-muted-foreground">
            {conversation.side === "seller" && <>{t("toShop", { shop: conversation.shop_name })} · </>}
            {link ? (
              <Link href={link} prefetch={false} className="underline underline-offset-4">
                {t(conversation.listing_type === "vehicle" ? "aboutVehicle" : "aboutProduct", { name: conversation.listing_name ?? "" })}
              </Link>
            ) : conversation.side === "buyer" ? (
              <Link href={`/sellers/${conversation.shop_slug}`} prefetch={false} className="underline underline-offset-4">{t("aboutShop")}</Link>
            ) : (
              t("aboutShop")
            )}
          </p>
        </div>
        {closed && <StatusPill tone="neutral">{t("closedPill")}</StatusPill>}
      </div>

      <div className="flex flex-wrap gap-2">
        {conversation.can_reply && (
          <button type="button" onClick={() => void act(() => setStatus(supabase, id, closed ? "open" : "closed"))} className={secondaryButton}>
            {t(closed ? "reopen" : "close")}
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            const { error } = await setArchived(supabase, id, !archived);
            if (error) {
              setFailure(messagingErrorKey(error));
              return;
            }
            // It moves to the other list, so it is shown there.
            router.push(`/account/messages?c=${id}${archived ? "" : "&box=archived"}`);
          }}
          className={secondaryButton}
        >
          {t(archived ? "unarchive" : "archive")}
        </button>
      </div>

      <div className="grid max-h-[60vh] gap-3 overflow-y-auto rounded-2xl bg-muted/40 p-3" aria-live="polite">
        {more && (
          <button type="button" onClick={() => void loadEarlier()} className={cn(secondaryButton, "justify-self-center")}>
            {t("earlier")}
          </button>
        )}
        {pages === null && !failure && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
        <ol aria-label={t("messagesLabel")} className="grid gap-3">
          {messages.map((message) => (
            <li key={message.id} className={cn("flex", message.from_me ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                  message.from_me ? "bg-primary text-primary-foreground" : "bg-card",
                )}
              >
                <p className={cn("text-xs font-semibold", message.from_me ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {message.from_me ? t("you") : message.sender_name || t(message.sender_side === "buyer" ? "aCustomer" : "theShop")}
                  {" · "}
                  <time dateTime={message.created_at}>{format.dateTime(new Date(message.created_at), { dateStyle: "medium", timeStyle: "short" })}</time>
                </p>
                {/* Text only (BD-04), shown as typed: nothing a person writes can become markup. */}
                <p className="mt-0.5 whitespace-pre-wrap break-words">{message.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div ref={end} />
      </div>

      {failure && <Notice kind="error">{errorText(failure)}</Notice>}

      {closed ? (
        <p className="text-sm text-muted-foreground">{t(conversation.can_reply ? "closedHelp" : "closedNoReply")}</p>
      ) : conversation.can_reply ? (
        <form onSubmit={send} noValidate className="grid gap-2">
          <Label htmlFor="reply">{t("reply")}</Label>
          <Textarea
            id="reply"
            value={draft}
            maxLength={MESSAGE_MAX}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t("textOnly")}</p>
            <button type="submit" disabled={working} className={primaryButton}>{working ? t("sending") : t("send")}</button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">{t("viewOnly")}</p>
      )}
    </section>
  );
}

/** One inbox for everything a person buys and sells (BD-05). */
export function Inbox() {
  const t = useTranslations("messaging");
  const params = useSearchParams();
  const router = useRouter();
  const selected = params.get("c");
  const archived = params.get("box") === "archived";
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await listConversations(getSupabaseBrowserClient(), archived);
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setConversations(data as Conversation[]);
  }, [archived]);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [user, load]);

  // Live delivery (PRD §9.1). The database only sends the changes this person may read.
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`inbox-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        void load();
        setVersion((v) => v + 1);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, () => void load())
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [user, load]);

  if (user === undefined) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  if (user === null) {
    return (
      <div className={cn(cardClass, "mx-auto max-w-lg text-center")}>
        <p className="text-sm text-muted-foreground">{t("signedOut")}</p>
        <Link href="/sign-in?next=/account/messages" className={cn(primaryButton, "mt-4")}>{t("signIn")}</Link>
      </div>
    );
  }

  const current = conversations?.find((conversation) => conversation.id === selected) ?? null;

  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label={t("boxes")} className="flex gap-2">
        {(["inbox", "archived"] as const).map((box) => {
          const active = (box === "archived") === archived;
          return (
            <button
              key={box}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => router.push(box === "archived" ? "/account/messages?box=archived" : "/account/messages")}
              className={cn(secondaryButton, active && "border-primary bg-primary text-primary-foreground hover:bg-primary")}
            >
              {t(`box.${box}`)}
            </button>
          );
        })}
      </div>
      {failed && <Notice kind="error">{t("errors.loadFailed")}</Notice>}
      <div className={cn(cardClass, "grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]")}>
        <div className={cn(current && "hidden lg:block")}>
          {conversations === null ? <p className="text-sm text-muted-foreground">{t("loading")}</p> : <ConversationList conversations={conversations} selected={selected} archived={archived} />}
        </div>
        {current ? (
          <Thread key={current.id} conversation={current} version={version} archived={archived} onChanged={load} />
        ) : (
          <p className="hidden self-center text-center text-sm text-muted-foreground lg:block">
            {selected && conversations ? t("errors.notFound") : t("choose")}
          </p>
        )}
      </div>
    </div>
  );
}
