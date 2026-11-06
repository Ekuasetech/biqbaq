"use client";

import { Eye, EyeOff, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { forgotPasswordSchema, registerSchema, signInSchema } from "@/modules/identity/schema";

type Errors = Record<string, string | undefined>;

// Accounts arrive with Supabase Auth in Phase 2. Until then these forms only
// validate in the browser: nothing is sent or stored, and they say so.
function useAuthForm(schema: z.ZodType) {
  const [errors, setErrors] = useState<Errors>({});
  const [validated, setValidated] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = schema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (result.success) {
      setErrors({});
      setValidated(true);
      return;
    }
    const next: Errors = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0]);
      next[field] ??= issue.message;
    }
    setErrors(next);
    setValidated(false);
  }

  return { errors, validated, onSubmit };
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

function FormFooter({ label, validated, result }: { label: string; validated: boolean; result: string }) {
  return (
    <>
      <button
        type="submit"
        className="h-12 w-full rounded-xl bg-brand-red text-sm font-bold text-brand-red-foreground transition-colors outline-none hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
      </button>
      <p role="status" className="text-sm empty:hidden">
        {validated && (
          <span className="flex gap-2">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {result}
          </span>
        )}
      </p>
    </>
  );
}

// Colours and layout follow Google's sign-in branding guidelines, which keep the
// button light in both themes. Connects through Supabase Auth in Phase 2.
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
  const { errors, validated, onSubmit } = useAuthForm(registerSchema);
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <GoogleButton label={t("googleRegister")} />
      <TextField name="name" label={t("name")} autoComplete="name" error={errors.name} />
      <TextField name="email" label={t("email")} type="email" autoComplete="email" error={errors.email} />
      <PasswordField name="password" label={t("password")} autoComplete="new-password" hint={t("passwordHint")} error={errors.password} />
      <PasswordField name="confirmPassword" label={t("confirmPassword")} autoComplete="new-password" error={errors.confirmPassword} />
      <FormFooter label={t("registerSubmit")} validated={validated} result={t("registerResult")} />
      <p className="text-center text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link href="/sign-in" className="font-semibold text-foreground underline underline-offset-4">
          {t("signInLink")}
        </Link>
      </p>
    </form>
  );
}

export function SignInForm() {
  const t = useTranslations("auth");
  const { errors, validated, onSubmit } = useAuthForm(signInSchema);
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <GoogleButton label={t("googleSignIn")} />
      <TextField name="email" label={t("email")} type="email" autoComplete="email" error={errors.email} />
      <PasswordField name="password" label={t("password")} autoComplete="current-password" error={errors.password} />
      <Link href="/forgot-password" className="-mt-1 w-fit text-sm font-semibold underline underline-offset-4">
        {t("forgotLink")}
      </Link>
      <FormFooter label={t("signInSubmit")} validated={validated} result={t("signInResult")} />
      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link href="/register" className="font-semibold text-foreground underline underline-offset-4">
          {t("registerLink")}
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const { errors, validated, onSubmit } = useAuthForm(forgotPasswordSchema);
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <TextField name="email" label={t("email")} type="email" autoComplete="email" error={errors.email} />
      <FormFooter label={t("forgotSubmit")} validated={validated} result={t("forgotResult")} />
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/sign-in" className="font-semibold text-foreground underline underline-offset-4">
          {t("backToSignIn")}
        </Link>
      </p>
    </form>
  );
}
