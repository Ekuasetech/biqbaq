import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildAuthEmails, hookPayloadSchema, isValidHookSignature, type HookPayload } from "./auth-emails";

const key = Buffer.from("a-local-test-key-of-enough-length");
const secret = `v1,whsec_${key.toString("base64")}`;
const now = 1_800_000_000;
const sign = (id: string, timestamp: number, body: string, signingKey = key) =>
  `v1,${createHmac("sha256", signingKey).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
const headers = (body: string, timestamp = now) => ({ id: "msg_1", timestamp: String(timestamp), signature: sign("msg_1", timestamp, body) });

describe("isValidHookSignature", () => {
  it("accepts a correct signature, alongside another", () => {
    expect(isValidHookSignature(secret, "{}", headers("{}"), now)).toBe(true);
    const h = headers("{}");
    expect(isValidHookSignature(secret, "{}", { ...h, signature: `v1,AAAA ${h.signature}` }, now)).toBe(true);
  });

  it("refuses anything altered, forged, missing or old", () => {
    expect(isValidHookSignature(secret, '{"a":1}', headers("{}"), now)).toBe(false);
    expect(isValidHookSignature(secret, "{}", { ...headers("{}"), id: "msg_2" }, now)).toBe(false);
    expect(isValidHookSignature(secret, "{}", { id: "msg_1", timestamp: String(now), signature: sign("msg_1", now, "{}", Buffer.from("wrong")) }, now)).toBe(false);
    expect(isValidHookSignature(secret, "{}", { id: null, timestamp: String(now), signature: "v1,x" }, now)).toBe(false);
    expect(isValidHookSignature(secret, "{}", { id: "msg_1", timestamp: "soon", signature: "v1,x" }, now)).toBe(false);
    expect(isValidHookSignature(secret, "{}", { ...headers("{}"), signature: "" }, now)).toBe(false);
    expect(isValidHookSignature(secret, "{}", headers("{}", now - 301), now)).toBe(false);
    expect(isValidHookSignature(secret, "{}", headers("{}", now + 301), now)).toBe(false);
    expect(isValidHookSignature("not-a-secret", "{}", headers("{}"), now)).toBe(false);
  });
});

const API = "http://127.0.0.1:54321/";
const payload = (type: string, extra: Partial<HookPayload["email_data"]> = {}, user: Partial<HookPayload["user"]> = {}): HookPayload =>
  hookPayloadSchema.parse({
    user: { email: "ada@mail.ca", user_metadata: { full_name: "Ada" }, ...user },
    email_data: { token: "123456", token_hash: "HASH", redirect_to: "http://localhost:3000/next?a=1", email_action_type: type, ...extra },
  });

describe("buildAuthEmails", () => {
  it("builds a confirmation link with everything encoded", () => {
    const [{ to, email }] = buildAuthEmails(payload("signup"), API);
    expect(to).toBe("ada@mail.ca");
    expect(email.subject).toBe("Confirm your Biqbaq account");
    const link = new URL(/http\S+verify\S+/.exec(email.text)![0]);
    expect(link.origin + link.pathname).toBe("http://127.0.0.1:54321/auth/v1/verify");
    expect(link.searchParams.get("token")).toBe("HASH");
    expect(link.searchParams.get("type")).toBe("signup");
    expect(link.searchParams.get("redirect_to")).toBe("http://localhost:3000/next?a=1");
    expect(email.html).toContain("Hello Ada,");
  });

  it("covers password resets, and the language chosen at sign-up", () => {
    expect(buildAuthEmails(payload("recovery"), API)[0].email.subject).toMatch(/reset/i);
    const [{ email }] = buildAuthEmails(payload("signup", {}, { user_metadata: { locale: "fr" } }), API);
    expect(email.subject).toBe("Confirmez votre compte Biqbaq");
    expect(email.text.startsWith("Bonjour,")).toBe(true);
  });

  it("sends an email change to both addresses with the matching links", () => {
    const emails = buildAuthEmails(payload("email_change", { token_hash_new: "CURRENT" }, { new_email: "new@mail.ca" }), API);
    expect(emails.find((e) => e.to === "new@mail.ca")?.email.text).toContain("token=HASH");
    expect(emails.find((e) => e.to === "ada@mail.ca")?.email.text).toContain("token=CURRENT");
  });

  it("shows a code where there is no link", () => {
    const [{ email }] = buildAuthEmails(payload("reauthentication"), API);
    expect(email.text).toContain("123456");
    expect(email.text).not.toContain("verify");
  });

  it("sends nothing for types Biqbaq does not use", () => {
    expect(buildAuthEmails(payload("password_changed_notification"), API)).toEqual([]);
    expect(buildAuthEmails(payload("constructor"), API)).toEqual([]);
  });

  it("cannot be used to inject markup through a name, and keeps it out of the subject", () => {
    const [{ email }] = buildAuthEmails(payload("signup", {}, { user_metadata: { full_name: "<script>x</script>\r\nBcc: a@b.c" } }), API);
    expect(email.html).not.toContain("<script");
    expect(email.subject).toBe("Confirm your Biqbaq account");
  });
});
