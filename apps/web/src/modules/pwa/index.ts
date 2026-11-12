/**
 * The installable web app (Q-61): when to offer installing Biqbaq, from what this browser
 * says about itself and remembers. Pure, so it can be tested.
 */
export const INSTALL_HINT_KEY = "biqbaq.installHint";
export const INSTALL_HINT_DELAY_MS = 25_000;
export const INSTALL_HINT_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

export type InstallWay = "prompt" | "ios" | null;

/** How this browser can install Biqbaq: its own prompt (Android, Chrome), Safari's Share menu on iPhone and iPad, or not at all. */
export function installWay(input: { userAgent: string; standalone: boolean; canPrompt: boolean; maxTouchPoints: number }): InstallWay {
  if (input.standalone) return null;
  if (input.canPrompt) return "prompt";
  const ua = input.userAgent;
  // iPadOS presents itself as a Mac, but with touch.
  const appleMobile = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && input.maxTouchPoints > 1);
  // Only Safari can add to the home screen there; other iPhone browsers have their own menus.
  const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return appleMobile && safari ? "ios" : null;
}

/** Whether to offer it again: not within 30 days of "Not now", and never once installed. */
export function installHintDue(stored: string | null, now: number): boolean {
  if (!stored) return true;
  try {
    const value = JSON.parse(stored) as { installed?: boolean; dismissedAt?: number };
    if (value.installed) return false;
    if (typeof value.dismissedAt === "number" && now - value.dismissedAt < INSTALL_HINT_SNOOZE_MS) return false;
  } catch {
    // Unreadable, so treated as nothing remembered.
  }
  return true;
}
