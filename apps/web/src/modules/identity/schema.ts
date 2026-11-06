import { z } from "zod";

export const PASSWORD_MIN = 8;
// Supabase Auth's password hashing only uses the first 72 bytes.
export const PASSWORD_MAX = 72;

const email = z.string().trim().pipe(z.email("emailInvalid"));

// Error values are keys into the `auth.errors` messages. The server must apply
// the same rules when these forms are connected to Supabase Auth in Phase 2.

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, "nameRequired").max(100, "nameTooLong"),
    email,
    password: z.string().min(PASSWORD_MIN, "passwordTooShort").max(PASSWORD_MAX, "passwordTooLong"),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "passwordsDoNotMatch",
    path: ["confirmPassword"],
  });

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "passwordRequired"),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password: z.string().min(PASSWORD_MIN, "passwordTooShort").max(PASSWORD_MAX, "passwordTooLong"),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "passwordsDoNotMatch",
    path: ["confirmPassword"],
  });
