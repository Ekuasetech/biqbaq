import { describe, expect, it } from "vitest";
import { CONTACT_LIMITS, contactEnquirySchema } from "./schema";

const valid = { name: "Ada", email: "ada@example.com", subject: "Hello", message: "Is this in stock?" };
const firstError = (input: object) => contactEnquirySchema.safeParse(input).error?.issues[0]?.message;

describe("contactEnquirySchema", () => {
  it("accepts a valid enquiry", () => {
    expect(contactEnquirySchema.safeParse(valid).success).toBe(true);
  });
  it("rejects blank fields and bad emails", () => {
    expect(firstError({ ...valid, name: "   " })).toBe("nameRequired");
    expect(firstError({ ...valid, email: "nope" })).toBe("emailInvalid");
    expect(firstError({ ...valid, message: "" })).toBe("messageRequired");
  });
  it("rejects overlong messages", () => {
    expect(firstError({ ...valid, message: "x".repeat(CONTACT_LIMITS.message + 1) })).toBe("messageTooLong");
  });
  it("rejects a line break in the email, which could inject headers", () => {
    expect(firstError({ ...valid, email: "a@b.com\nBcc: x@y.com" })).toBe("emailInvalid");
  });
});
