import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Turning phone notifications on and off on this device (Q-66). The browser asks the person
 * first; nothing is asked until they tap the button.
 */
export const PUSH_CATEGORIES = ["messages", "orders", "applications", "staff", "shop"] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];

export type PushState = "unsupported" | "ios-install" | "blocked" | "off" | "on";

/** The public key, as the browser wants it. */
function applicationServerKey(key: string) {
  const padded = `${key}${"=".repeat((4 - (key.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

async function registration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js");
}

/** Where this device stands. iPhones allow notifications only once Biqbaq is on the home screen. */
export async function pushState(): Promise<PushState> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIos() && !standalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const existing = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
  return existing ? "on" : "off";
}

/** A short name for the device, so people can tell their devices apart. */
function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows computer";
  if (/Macintosh/i.test(ua)) return "Mac";
  return "This device";
}

export async function turnPushOn(supabase: SupabaseClient): Promise<PushState> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return "unsupported";
  if ((await Notification.requestPermission()) !== "granted") return Notification.permission === "denied" ? "blocked" : "off";
  const worker = await registration();
  await navigator.serviceWorker.ready;
  const subscription = (await worker.pushManager.getSubscription()) ?? (await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(key) }));
  const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await supabase.rpc("save_push_subscription", { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_label: deviceLabel() });
  if (error) {
    await subscription.unsubscribe();
    throw new Error(error.message);
  }
  return "on";
}

export async function turnPushOff(supabase: SupabaseClient): Promise<PushState> {
  const subscription = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
  if (subscription) {
    await supabase.rpc("remove_push_subscription", { p_endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
  return "off";
}

export const listPushPreferences = (supabase: SupabaseClient) => supabase.rpc("my_push_preferences");
export const setPushPreference = (supabase: SupabaseClient, category: PushCategory, enabled: boolean) =>
  supabase.rpc("set_push_preference", { p_category: category, p_enabled: enabled });
