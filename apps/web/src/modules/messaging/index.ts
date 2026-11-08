import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// Buyer-seller messaging (PRD §9.1). Every rule is enforced by the database functions;
// these only call them and turn their refusals into messages.

export const MESSAGE_MAX = 2000;

export const messageSchema = z.string().trim().min(1, "required").max(MESSAGE_MAX, "tooLong");

export interface Conversation {
  id: string;
  side: "buyer" | "seller";
  status: "open" | "closed";
  other_name: string;
  shop_name: string;
  shop_slug: string;
  listing_type: "product" | "vehicle" | null;
  listing_name: string | null;
  listing_slug: string | null;
  last_message_at: string;
  last_body: string | null;
  last_from_me: boolean | null;
  unread: number;
  can_reply: boolean;
}

export interface Message {
  id: string;
  sender_side: "buyer" | "seller";
  sender_name: string;
  from_me: boolean;
  body: string;
  created_at: string;
}

export interface AdminConversation {
  id: string;
  buyer_name: string;
  buyer_email: string | null;
  shop_name: string;
  listing_name: string | null;
  status: "open" | "closed";
  message_count: number;
  last_message_at: string;
  total: number;
}

export interface AdminMessage {
  id: string;
  sender_side: "buyer" | "seller";
  sender_name: string;
  body: string;
  created_at: string;
}

export const MESSAGES_PAGE_SIZE = 50;
export const ADMIN_PAGE_SIZE = 20;

export const startConversation = (
  supabase: SupabaseClient,
  subject: { shop: string; product?: string; vehicle?: string },
  body: string,
) =>
  supabase.rpc("start_conversation", {
    p_shop: subject.shop,
    p_product: subject.product ?? null,
    p_vehicle: subject.vehicle ?? null,
    p_body: body,
  });
export const sendMessage = (supabase: SupabaseClient, conversation: string, body: string) =>
  supabase.rpc("send_message", { p_conversation: conversation, p_body: body });
export const listConversations = (supabase: SupabaseClient, archived: boolean) =>
  supabase.rpc("my_conversations", { p_archived: archived });
export const listMessages = (supabase: SupabaseClient, conversation: string, before?: string) =>
  supabase.rpc("conversation_messages", { p_conversation: conversation, p_before: before ?? null, p_limit: MESSAGES_PAGE_SIZE });
export const markRead = (supabase: SupabaseClient, conversation: string) =>
  supabase.rpc("mark_conversation_read", { p_conversation: conversation });
export const setArchived = (supabase: SupabaseClient, conversation: string, archived: boolean) =>
  supabase.rpc("set_conversation_archived", { p_conversation: conversation, p_archived: archived });
export const setStatus = (supabase: SupabaseClient, conversation: string, status: "open" | "closed") =>
  supabase.rpc("set_conversation_status", { p_conversation: conversation, p_status: status });
export const unreadCount = (supabase: SupabaseClient) => supabase.rpc("unread_conversation_count");
export const adminFindConversations = (supabase: SupabaseClient, search: string, page: number) =>
  supabase.rpc("admin_find_conversations", { p_search: search || null, p_limit: ADMIN_PAGE_SIZE, p_offset: (page - 1) * ADMIN_PAGE_SIZE });
export const adminReadConversation = (supabase: SupabaseClient, conversation: string, reason: string) =>
  supabase.rpc("admin_read_conversation", { p_conversation: conversation, p_reason: reason });

/** Where the conversation's listing is on the site, if it has one. */
export function listingPath(conversation: Pick<Conversation, "listing_type" | "listing_slug">): string | null {
  if (!conversation.listing_slug) return null;
  return conversation.listing_type === "vehicle" ? `/cargo-cars/${conversation.listing_slug}` : `/products/${conversation.listing_slug}`;
}

/** Oldest first, for showing; the database hands pages back newest first. */
export const inReadingOrder = (pages: Message[][]) =>
  pages.flat().sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));

/** Window event the inbox sends after reading, so the header's count updates at once. */
export const UNREAD_CHANGED = "biqbaq:unread-changed";

/** Maps a refusal to a message key under messaging.errors, without showing the database's wording. */
export function messagingErrorKey(error: { code?: string; message?: string }): string {
  const known: Record<string, string> = {
    MESSAGE_INVALID: "tooLong",
    OWN_SHOP: "ownShop",
    SHOP_NOT_FOUND: "unavailable",
    SHOP_UNAVAILABLE: "unavailable",
    LISTING_NOT_FOUND: "unavailable",
    CONVERSATION_NOT_FOUND: "notFound",
    CONVERSATION_CLOSED: "closed",
    RATE_LIMITED: "rateLimited",
    REASON_REQUIRED: "reasonRequired",
  };
  if (error.message && known[error.message]) return known[error.message];
  return error.code === "42501" ? "notAllowed" : "generic";
}
