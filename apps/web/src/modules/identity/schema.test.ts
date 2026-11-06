import { describe, expect, it } from "vitest";
import { forgotPasswordSchema, PASSWORD_MAX, PASSWORD_MIN, registerSchema, signInSchema } from "./schema";

const valid = { name: "Ada", email: "ada@example.com", password: "long-enough", confirmPassword: "long-enough" };
const firstError = (input: object) => registerSchema.safeParse(input).error?.issues[0]?.message;

describe("registerSchema", () => {
  it("accepts valid details, and trims the name and email", () => {
    const result = registerSchema.parse({ ...valid, name: " Ada ", email: " ada@example.com " });
    expect(result.name).toBe("Ada");
    expect(result.email).toBe("ada@example.com");
  });

  it("rejects a blank name and a bad email", () => {
    expect(firstError({ ...valid, name: "  " })).toBe("nameRequired");
    expect(firstError({ ...valid, email: "nope" })).toBe("emailInvalid");
  });

  it("enforces the password length limits", () => {
    const short = "x".repeat(PASSWORD_MIN - 1);
    expect(firstError({ ...valid, password: short, confirmPassword: short })).toBe("passwordTooShort");
    const long = "x".repeat(PASSWORD_MAX + 1);
    expect(firstError({ ...valid, password: long, confirmPassword: long })).toBe("passwordTooLong");
  });

  it("does not trim passwords, because spaces can be part of them", () => {
    expect(registerSchema.parse({ ...valid, password: " spaced pass ", confirmPassword: " spaced pass " }).password).toBe(" spaced pass ");
  });

  it("requires the passwords to match, and reports it on the confirm field", () => {
    const issue = registerSchema.safeParse({ ...valid, confirmPassword: "different" }).error?.issues[0];
    expect(issue?.message).toBe("passwordsDoNotMatch");
    expect(issue?.path).toEqual(["confirmPassword"]);
  });
});

describe("signInSchema and forgotPasswordSchema", () => {
  it("requires an email and a password to sign in", () => {
    expect(signInSchema.safeParse({ email: "ada@example.com", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "ada@example.com", password: "" }).error?.issues[0]?.message).toBe("passwordRequired");
    expect(signInSchema.safeParse({ email: "nope", password: "x" }).error?.issues[0]?.message).toBe("emailInvalid");
  });

  it("requires a valid email to reset a password", () => {
    expect(forgotPasswordSchema.safeParse({ email: "ada@example.com" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "" }).success).toBe(false);
  });
});
