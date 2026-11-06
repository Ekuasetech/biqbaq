"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_LIMITS, contactEnquirySchema } from "@/modules/seller-contact/schema";

type FieldErrors = Partial<Record<"name" | "email" | "subject" | "message", string>>;

// Sending arrives in Phase 4 (Resend, server validation, rate limiting), so this
// only validates, and tells the visitor plainly that nothing was sent.
export function ContactForm() {
  const t = useTranslations("contact");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [validated, setValidated] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = contactEnquirySchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (result.success) {
      setErrors({});
      setValidated(true);
      return;
    }
    const next: FieldErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof FieldErrors;
      next[field] ??= issue.message;
    }
    setErrors(next);
    setValidated(false);
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
      <div className="flex flex-col gap-3 sm:col-span-2">
        <Button type="submit" size="lg" className="h-11 w-full bg-brand-red px-6 text-brand-red-foreground hover:bg-brand-red/90 sm:w-fit">
          {t("send")}
        </Button>
        <p role="status" className="min-h-5 text-sm">
          {validated && (
            <span className="flex gap-2">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("previewResult")}
            </span>
          )}
        </p>
      </div>
    </form>
  );
}
