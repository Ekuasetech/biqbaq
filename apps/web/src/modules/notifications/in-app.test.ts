import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { NOTIFICATION_PATHS, notificationPath } from "./in-app";
import { renderEmail } from "./templates";

const SITE = "https://biqbaq.test";
// Messages have their own count instead (Q-38).
const MESSAGE_TEMPLATES = ["message_to_seller", "message_to_buyer"];

describe("in-app notifications", () => {
  it("lead where their email leads", () => {
    for (const [type, path] of Object.entries(NOTIFICATION_PATHS)) {
      const email = renderEmail(type, { role: "seller", shop: "S", product: "P" }, { name: "Ada", locale: "en" }, SITE);
      expect(email, type).not.toBeNull();
      expect(email!.text, type).toContain(`${SITE}${path}\n`);
    }
  });

  it("cover every email except messages, in both languages", () => {
    const templates = ["welcome", "application_received", "application_approved", "application_rejected", "verification_verified", "verification_rejected", "verification_suspended", "verification_restored", "verification_revoked", "product_suspended", "product_restored", "product_published_for_you", "shop_suspended", "shop_restored", "publishing_suspended", "publishing_restored", "role_assigned", "role_suspended", "role_restored", "role_revoked", "staff_invitation", "staff_approved", "staff_suspended", "staff_restored", "staff_removed", "bulk_email_enabled", "bulk_email_disabled", "bulk_email_paused", "bulk_email_paused_admin", "payments_enabled", "payments_disabled", "order_paid", "order_received", "order_refunded", "order_fulfilled", "order_disputed", ...MESSAGE_TEMPLATES];
    for (const template of templates) {
      expect(renderEmail(template, {}, { name: null, locale: "en" }, SITE), template).not.toBeNull();
      if (MESSAGE_TEMPLATES.includes(template)) continue;
      expect(NOTIFICATION_PATHS[template], template).toBeDefined();
      expect((en.notifications.types as Record<string, string>)[template], template).toBeDefined();
      expect((fr.notifications.types as Record<string, string>)[template], template).toBeDefined();
    }
  });

  it("send anything unknown to the account page", () => {
    expect(notificationPath("something_new")).toBe("/account");
  });
});
