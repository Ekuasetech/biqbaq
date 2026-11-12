import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "line",
  // Every test starts as if the sign-up pop-up and the install hint were already answered, so
  // they do not cover the page; their own tests start with nothing remembered.
  // The service worker is off by default, so it never stands between a test and the routes it
  // fakes; the installable-app test turns it on for itself.
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", storageState: "e2e/popup-seen.json", serviceWorkers: "block" },
  webServer: [
    { command: "npx next start -p 3100", url: "http://localhost:3100", reuseExistingServer: true },
    // Local Supabase Auth sends its emails through the web app on port 3000, whichever port
    // the browser tests use. This uses your dev server when it is already running.
    { command: "npx next start -p 3000", url: "http://localhost:3000", reuseExistingServer: true },
  ],
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
});
