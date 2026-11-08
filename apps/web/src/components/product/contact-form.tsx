"use client";

import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_LIMITS, contactEnquirySchema } from "@/modules/seller-contact/schema";

type FieldErrors = Partial<Record<"name" | "email" | "subject" | "message", string>>;

type Outcome = "preview" | "sent" | "rateLimited" | "unavailable" | "failed";

// Sends to a product's or a cargo car's seller. With no endpoint, it only validates and
// tells the visitor plainly that nothing was sent.
export function ContactForm({ endpoint }: { endpoint?: string }) {
  const t = useTranslations("contact");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [working, setWorking] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working) return;
    const form = event.currentTarget;
    const { website, ...fields } = Object.fromEntries(new FormData(form));
    const result = contactEnquirySchema.safeParse(fields);
    if (result.success) {
      setErrors({});
      if (!endpoint) {
        setOutcome("preview");
        return;
      }
      setWorking(true);
      setOutcome(null);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(website ? { ...result.data, website } : result.data),
        });
        if (response.ok) {
          form.reset();
          setOutcome("sent");
        } else if (response.status === 429) {
          setOutcome("rateLimited");
        } else if (response.status === 404 || response.status === 503) {
          setOutcome("unavailable");
        } else {
          setOutcome("failed");
        }
      } catch {
        setOutcome("failed");
      } finally {
        setWorking(false);
      }
      return;
    }
    const next: FieldErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof FieldErrors;
      next[field] ??= issue.message;
    }
    setErrors(next);
    setOutcome(null);
  }

  const field = (name: keyof FieldErrors) => ({
    id: `contact-${name}`,
    name,
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `contact-${name}-error` : undefined,
    className: "text-base md:text-sm",
  });
  const error = (name: keyof FieldErrors) =>
    errors[name] && (
      <p id={`contact-${name}-error`} className="text-sm text-destructive">
        {t(`errors.${errors[name]}`)}
      </p>
    );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="contact-name">{t("name")}</Label>
        <Input {...field("name")} className="h-11 text-base md:text-sm" autoComplete="name" maxLength={CONTACT_LIMITS.name} />
        {error("name")}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="contact-email">{t("email")}</Label>
        <Input {...field("email")} className="h-11 text-base md:text-sm" type="email" autoComplete="email" />
        {error("email")}
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="contact-subject">{t("subject")}</Label>
        <Input {...field("subject")} className="h-11 text-base md:text-sm" maxLength={CONTACT_LIMITS.subject} />
        {error("subject")}
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="contact-message">{t("message")}</Label>
        <Textarea {...field("message")} rows={5} maxLength={CONTACT_LIMITS.message} />
        {error("message")}
      </div>
      {/* Hidden from people, so only a robot fills it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <Button type="submit" size="lg" disabled={working} className="h-11 w-full bg-brand-red px-6 text-brand-red-foreground hover:bg-brand-red/90 sm:w-fit">
          {working ? t("sending") : t("send")}
        </Button>
        <p role="status" className="min-h-5 text-sm">
          {outcome && (
            <span className={`flex gap-2 ${outcome === "sent" || outcome === "preview" ? "" : "text-destructive"}`}>
              {outcome === "sent" ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              ) : outcome === "preview" ? (
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              )}
              {t(`outcome.${outcome}`)}
            </span>
          )}
        </p>
      </div>
    </form>
  );
}
