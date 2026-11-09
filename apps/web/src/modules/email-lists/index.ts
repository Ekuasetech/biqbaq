import type { SupabaseClient } from "@supabase/supabase-js";

// Customer email lists (Q-42 to Q-46). A seller's list is passed by shop; Biqbaq's own
// list, for Super Admin, by null. The database enforces every rule and limit.

export const SUBJECT_MAX = 150;
export const BODY_MAX = 5000;
export const ADDRESS_MIN = 10;
export const ADDRESS_MAX = 300;

export interface EmailList {
  list_id: string | null;
  enabled: boolean;
  sender_name: string | null;
  mailing_address: string | null;
  pending: number;
  confirmed: number;
  unsubscribed: number;
  campaigns_today: number;
  recipients_today: number;
  max_campaigns: number;
  max_recipients: number;
  max_new_addresses: number;
  added_today: number;
  /** Why the shop's bulk email paused itself, if it did (Q-55). */
  pause_reason: "complaints" | "unsubscribes" | "bounces" | null;
  clients: number;
  singles_today: number;
  max_singles: number;
}

export interface Subscriber {
  email: string;
  name: string | null;
  phone: string | null;
  status: "client" | "pending" | "confirmed" | "unsubscribed" | "bounced";
  source: "added" | "self";
  created_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  total: number;
}

export interface Campaign {
  id: string;
  subject: string;
  recipients: number;
  created_at: string;
  /** Set when it went to one client. */
  single_email: string | null;
  /** How many there are in all, for pages. */
  total: number;
}

export interface ShopEmailList {
  seller_id: string;
  shop_name: string;
  shop_slug: string;
  enabled: boolean;
  confirmed: number;
  pending: number;
  last_sent_at: string | null;
  pause_reason: "complaints" | "unsubscribes" | "bounces" | null;
  total: number;
}

export const SUBSCRIBERS_PAGE_SIZE = 50;

export const getList = (supabase: SupabaseClient, seller: string | null) => supabase.rpc("my_email_list", { p_seller: seller });
export const setMailingAddress = (supabase: SupabaseClient, seller: string | null, address: string) =>
  supabase.rpc("set_list_mailing_address", { p_seller: seller, p_address: address });
export const listSubscribers = (supabase: SupabaseClient, seller: string | null, status: string, page: number) =>
  supabase.rpc("list_subscribers_page", {
    p_seller: seller,
    p_status: status === "all" ? null : status,
    p_search: null,
    p_limit: SUBSCRIBERS_PAGE_SIZE,
    p_offset: (page - 1) * SUBSCRIBERS_PAGE_SIZE,
  });
export interface NewClient {
  name: string;
  email: string;
  phone: string | null;
  /** Ask them to join the shop's emails (Q-49). */
  invite: boolean;
}
export const addClients = (supabase: SupabaseClient, seller: string | null, clients: NewClient[], hasConsent: boolean) =>
  supabase.rpc("add_list_clients", { p_seller: seller, p_clients: clients, p_has_consent: hasConsent });
export const removeSubscriber = (supabase: SupabaseClient, seller: string | null, email: string) =>
  supabase.rpc("remove_list_subscriber", { p_seller: seller, p_email: email });
/** To every client receiving updates, or to one of them (Q-54). */
export const sendCampaign = (supabase: SupabaseClient, seller: string | null, subject: string, body: string, to?: string | null) =>
  supabase.rpc("send_email_campaign", { p_seller: seller, p_subject: subject, p_body: body, p_to: to ?? null });
export const stopUpdates = (supabase: SupabaseClient, seller: string | null, email: string) =>
  supabase.rpc("stop_client_updates", { p_seller: seller, p_email: email });
export const CAMPAIGNS_PAGE_SIZE = 20;
export const listCampaigns = (supabase: SupabaseClient, seller: string | null, page = 1) =>
  supabase.rpc("list_email_campaigns", { p_seller: seller, p_limit: CAMPAIGNS_PAGE_SIZE, p_offset: (Math.max(page, 1) - 1) * CAMPAIGNS_PAGE_SIZE });
export const getSubscription = (supabase: SupabaseClient, shop: string | null) => supabase.rpc("my_list_subscription", { p_shop: shop });
export const setSubscription = (supabase: SupabaseClient, shop: string | null, subscribed: boolean) =>
  supabase.rpc("set_list_subscription", { p_shop: shop, p_subscribed: subscribed });
export const adminListShopLists = (supabase: SupabaseClient, search: string, page: number) =>
  supabase.rpc("admin_list_shop_email_lists", { p_search: search || null, p_limit: 20, p_offset: (page - 1) * 20 });
export const adminSetShopBulkEmail = (supabase: SupabaseClient, seller: string, enabled: boolean) =>
  supabase.rpc("admin_set_shop_bulk_email", { p_seller: seller, p_enabled: enabled });

export function emailListErrorKey(error: { code?: string; message?: string }): string {
  const known: Record<string, string> = {
    BULK_EMAIL_DISABLED: "disabled",
    CONSENT_REQUIRED: "consentRequired",
    EMAIL_INVALID: "emailInvalid",
    NAME_INVALID: "nameRequired",
    PHONE_INVALID: "phoneInvalid",
    EMAIL_REPEATED: "emailRepeated",
    ADDRESS_LIMIT: "addressLimit",
    ADDRESS_INVALID: "addressInvalid",
    ADDRESS_REQUIRED: "addressRequired",
    DETAILS_INVALID: "detailsInvalid",
    EMAIL_OFF: "emailOff",
    NO_SUBSCRIBERS: "noSubscribers",
    CAMPAIGN_LIMIT: "campaignLimit",
    CLIENT_NOT_RECEIVING: "clientNotReceiving",
    SINGLE_LIMIT: "singleLimit",
    CLIENT_NOT_FOUND: "generic",
    RECIPIENT_LIMIT: "recipientLimit",
    LIST_NOT_FOUND: "listNotFound",
    EMAIL_UNCONFIRMED: "emailUnconfirmed",
  };
  if (error.message && known[error.message]) return known[error.message];
  return error.code === "42501" ? "notAllowed" : "generic";
}
