"use client";

import { forgetReferral, rememberedReferral, rememberReferralFrom } from "@/modules/referrals";
import { safeNext } from "@/lib/safe-next";
import { Eye, EyeOff, Info, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPathname, Link, useRouter } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { forgotPasswordSchema, registerSchema, resetPasswordSchema, signInSchema } from "@/modules/identity/schema";

type Errors = Record<string, string | undefined>;

/** A key into auth.errors, or nothing if the action worked. */
type ActionResult = string | undefined;

// Shown in place of Supabase's own wording, which can reveal too much and is not
// translated. Anything unexpected becomes a general message.
function errorKey(error: { code?: string; name?: string }): string {
  switch (error.code) {
    case "invalid_credentials":
      return "invalidCredentials";
    case "email_not_confirmed":
      return "emailNotConfirmed";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "rateLimited";
    case "weak_password":
      return "weakPassword";
    case "same_password":
      return "samePassword";
    case "session_not_found":
      return "resetLinkExpired";
  }
  return error.name === "AuthSessionMissingError" ? "resetLinkExpired" : "generic";
}

// Passwords go straight from the browser to Supabase Auth, never through our server.
function useAuthForm<T>(schema: z.ZodType<T>, action: (values: T) => Promise<ActionResult>) {
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "working" | "done">("idle");
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = schema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    setFormError(null);
    if (!result.success) {
      const next: Errors = {};
      for (const issue of result.error.issues) {
        const field = String(issue.path[0]);
        next[field] ??= issue.message;
      }
      setErrors(next);
      setStatus("idle");
      return;
    }

    setErrors({});
    setStatus("working");
    let failure: ActionResult;
    try {
      failure = await action(result.data);
    } catch {
      failure = "generic";
    }
    setFormError(failure ?? null);
    setStatus(failure ? "idle" : "done");
  }

  return { errors, status, formError, onSubmit };
}

/** Where an email link should come back to, on the current site. */
function useEmailLink() {
  const locale = useLocale();
  return (href: string) =>
    `${window.location.origin}/api/v1/auth/callback?next=${encodeURIComponent(getPathname({ href, locale }))}`;
}

function Field({
  name,
  label,
  error,
  hint,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  const t = useTranslations("auth.errors");
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`auth-${name}`}>{label}</Label>
      {children}
      {hint && !error && <p id={`auth-${name}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`auth-${name}-error`} className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
    </div>
  );
}

const describedBy = (name: string, error?: string, hint?: string) =>
  error ? `auth-${name}-error` : hint ? `auth-${name}-hint` : undefined;

function TextField({
  name,
  label,
  type = "text",
  autoComplete,
  error,
}: {
  name: string;
  label: string;
  type?: string;
  autoComplete: string;
  error?: string;
}) {
  return (
    <Field name={name} label={label} error={error}>
      <Input
        id={`auth-${name}`}
        name={name}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(name, error)}
        className="h-11 text-base md:text-sm"
      />
    </Field>
  );
}

function PasswordField({
  name,
  label,
  autoComplete,
  error,
  hint,
}: {
  name: string;
  label: string;
  autoComplete: string;
  error?: string;
  hint?: string;
}) {
  const t = useTranslations("auth");
  const [visible, setVisible] = useState(false);
  return (
    <Field name={name} label={label} error={error} hint={hint}>
      <div className="relative">
        <Input
          id={`auth-${name}`}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(name, error, hint)}
          className="h-11 pr-11 text-base md:text-sm"
        />
        <button
          type="button"
          aria-label={t(visible ? "hidePassword" : "showPassword", { field: label })}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
          className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    </Field>
  );
}

function FormFooter({
  label,
  status,
  formError,
}: {
  label: string;
  status: "idle" | "working" | "done";
  formError: string | null;
}) {
  const t = useTranslations("auth");
  return (
    <>
      {formError && (
        <p role="alert" className="flex gap-2 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t(`errors.${formError}`)}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "working"}
        className="h-12 w-full rounded-xl bg-brand-red text-sm font-bold text-brand-red-foreground transition-colors outline-none hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-70"
      >
        {status === "working" ? t("working") : label}
      </button>
    </>
  );
}

/** Replaces a finished form, so the outcome is seen and typed passwords are cleared. */
function DonePanel({ message }: { message: string }) {
  const t = useTranslations("auth");
  const ref = useRef<HTMLParagraphElement>(null);

  // The long form has just gone, so the page may be scrolled past this message.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "center" });
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="grid gap-4">
      <p ref={ref} tabIndex={-1} role="status" className="flex gap-3 rounded-2xl bg-muted p-4 text-sm font-medium outline-none">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {message}
      </p>
      <Link href="/sign-in" className="text-center text-sm font-semibold underline underline-offset-4">
        {t("backToSignIn")}
      </Link>
    </div>
  );
}

/** Opens in a new tab, so that reading the documents does not clear the form. */
function AgreementNotice() {
  const t = useTranslations("auth");
  const linkClass = "font-medium text-foreground underline underline-offset-2";
  return (
    <p className="text-center text-xs text-muted-foreground">
      {t.rich("agreement", {
        conditions: (chunks) => (
          <Link href="/conditions-of-use" target="_blank" className={linkClass}>
            {chunks}
          </Link>
        ),
        privacy: (chunks) => (
          <Link href="/privacy-notice" target="_blank" className={linkClass}>
            {chunks}
          </Link>
        ),
      })}
    </p>
  );
}

// Colours and layout follow Google's sign-in branding guidelines, which keep the
// button light in both themes. Needs Google credentials before it can be connected.
function GoogleButton({ label }: { label: string }) {
  const t = useTranslations("auth");
  const [clicked, setClicked] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setClicked(true)}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#747775] bg-white text-sm font-semibold text-[#1f1f1f] transition-colors outline-none hover:bg-[#f2f2f2] focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg aria-hidden viewBox="0 0 48 48" className="size-5 shrink-0">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        {label}
      </button>
      <p role="status" className="text-sm empty:hidden">
        {clicked && (
          <span className="flex gap-2">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("googleResult")}
          </span>
        )}
      </p>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span aria-hidden className="h-px flex-1 bg-border" />
        {t("or")}
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}

export function RegisterForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const emailLink = useEmailLink();
  const { errors, status, formError, onSubmit } = useAuthForm(registerSchema, async (values) => {
    // The referral link this browser last opened, if within 30 days (PRD §14.3, BD-11).
    // The database checks the code itself, so nothing sent here can earn false credit.
    rememberReferralFrom(window.location.search);
    const referral = rememberedReferral();
    const { error } = await getSupabaseBrowserClient().auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: {
          full_name: values.name,
          locale,
          ...(referral && { referral_code: referral.code, referral_opened_at: referral.openedAt }),
        },
        emailRedirectTo: emailLink("/"),
      },
    });
    if (!error) forgetReferral();
    // Answers an email already in use exactly like a new one, so this form never
    // reveals who has an account.
    if (error?.code === "user_already_exists" || error?.code === "email_exists") return undefined;
    return error ? errorKey(error) : undefined;
  });

  if (status === "done") return <DonePanel message={t("registerResult")} />;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <GoogleButton label={t("googleRegister")} />
      <TextField name="name" label={t("name")} autoComplete="name" error={errors.name} />
      <TextField name="email" label={t("email")} type="email" autoComplete="email" error={errors.email} />
      <PasswordField name="password" label={t("password")} autoComplete="new-password" hint={t("passwordHint")} error={errors.password} />
      <PasswordField name="confirmPassword" label={t("confirmPassword")} autoComplete="new-password" error={errors.confirmPassword} />
      <FormFooter label={t("registerSubmit")} status={status} formError={formError} />
      <AgreementNotice />
      <p className="text-center text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link href="/sign-in" className="font-semibold text-foreground underline underline-offset-4">
          {t("signInLink")}
        </Link>
      </p>
    </form>
  );
}

const noSubscribe = () => () => {};

export function SignInForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  // Set by the email link route when a link could not be used.
  const linkExpired = useSyncExternalStore(
    noSubscribe,
    () => new URLSearchParams(window.location.search).get("link") === "expired",
    () => false,
  );
  const { errors, status, formError, onSubmit } = useAuthForm(signInSchema, async (values) => {
    const { error } = await getSupabaseBrowserClient().auth.signInWithPassword(values);
    if (error) return errorKey(error);
    router.push(safeNext(new URLSearchParams(window.location.search).get("next")));
    return undefined;
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {linkExpired && (
        <p role="alert" className="flex gap-2 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("errors.linkExpired")}
        </p>
      )}
      <GoogleButton label={t("googleSignIn")} />
      <TextField name="email" label={t("email")} type="email" autoComplete="email" error={errors.email} />
      <PasswordField name="password" label={t("password")} autoComplete="current-password" error={errors.password} />
      <Link href="/forgot-password" className="-mt-1 w-fit text-sm font-semibold underline underline-offset-4">
        {t("forgotLink")}
      </Link>
      <FormFooter label={t("signInSubmit")} status={status} formError={formError} />
      <AgreementNotice />
      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link href="/register" className="font-semibold text-foreground underline underline-offset-4">
          {t("registerLink")}
        </Link>
      </p>
    </form>
  );
}

/** Where the emailed reset link lands, with a temporary session from that link. */
export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const { errors, status, formError, onSubmit } = useAuthForm(resetPasswordSchema, async (values) => {
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password: values.password });
    return error ? errorKey(error) : undefined;
  });

  if (status === "done") return <DonePanel message={t("resetResult")} />;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <PasswordField name="password" label={t("newPassword")} autoComplete="new-password" hint={t("passwordHint")} error={errors.password} />
      <PasswordField name="confirmPassword" label={t("confirmNewPassword")} autoComplete="new-password" error={errors.confirmPassword} />
      <FormFooter label={t("resetSubmit")} status={status} formError={formError} />
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/sign-in" className="font-semibold text-foreground underline underline-offset-4">
          {t("backToSignIn")}
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const emailLink = useEmailLink();
  const { errors, status, formError, onSubmit } = useAuthForm(forgotPasswordSchema, async (values) => {
    const { error } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(values.email, {
      redirectTo: emailLink("/reset-password"),
    });
    return error ? errorKey(error) : undefined;
  });

  if (status === "done") return <DonePanel message={t("forgotResult")} />;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <TextField name="email" label={t("email")} type="email" autoComplete="email" error={errors.email} />
      <FormFooter label={t("forgotSubmit")} status={status} formError={formError} />
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/sign-in" className="font-semibold text-foreground underline underline-offset-4">
          {t("backToSignIn")}
        </Link>
      </p>
    </form>
  );
}
