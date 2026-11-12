/**
 * The browser's offer to install Biqbaq (Android, Chrome, Edge), kept in one place so the
 * install hint and the front page's app section share it: whichever is used, both know.
 * Browser only.
 */
export interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPrompt | null = null;
let installed = false;
let listening = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** Starts listening; safe to call from every component that needs it. */
export function listenForInstall() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPrompt;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export function subscribeToInstall(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const canPromptInstall = () => deferred !== null;
export const wasInstalled = () => installed;

/** Opens the browser's own install prompt. True when the person installed Biqbaq. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  await event.prompt();
  const { outcome } = await event.userChoice;
  deferred = null;
  if (outcome === "accepted") installed = true;
  notify();
  return outcome === "accepted";
}
