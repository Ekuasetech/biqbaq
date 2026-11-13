import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { notificationPath } from "@/modules/notifications/in-app";

/**
 * What a push says and where it opens (Q-66): the bell's own sentence for the event, so the
 * phone, the bell and the email agree; messages, which have no bell, get a short line of
 * their own. Never the message itself.
 */
export interface PushText {
  title: string;
  body: string;
  url: string;
}

export function pushText(template: string, data: Record<string, unknown>, locale: string): PushText {
  const language = locale === "fr" ? "fr" : "en";
  const messages = language === "fr" ? fr : en;
  const t = createTranslator({ locale: language, messages });
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const role = text(data.role);
  const roleKey = `account.roles.${role}`;
  const values = {
    role: role && t.has(roleKey as never) ? t(roleKey as never) : role,
    shop: text(data.shop),
    product: text(data.product),
  };
  const prefix = language === "fr" ? "/fr" : "";
  if (template === "message_to_buyer" || template === "message_to_seller") {
    const conversation = text(data.conversation);
    return {
      title: "Biqbaq",
      body: t(`push.${template}` as never, values as never),
      url: `${prefix}/account/messages${/^[0-9a-f-]{36}$/.test(conversation) ? `?c=${conversation}` : ""}`,
    };
  }
  const key = `notifications.types.${template}`;
  return {
    title: "Biqbaq",
    body: t.has(key as never) ? t(key as never, values as never) : t("notifications.types.other" as never),
    url: `${prefix}${notificationPath(template)}`,
  };
}
