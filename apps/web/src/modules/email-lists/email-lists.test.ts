import { describe, expect, it } from "vitest";
import { emailListErrorKey } from "./index";

describe("emailListErrorKey", () => {
  it("maps refusals to messages", () => {
    expect(emailListErrorKey({ code: "P0001", message: "RECIPIENT_LIMIT" })).toBe("recipientLimit");
    expect(emailListErrorKey({ code: "55000", message: "BULK_EMAIL_DISABLED" })).toBe("disabled");
    expect(emailListErrorKey({ code: "42501", message: "NOT_AUTHORIZED" })).toBe("notAllowed");
    expect(emailListErrorKey({ code: "23514", message: "PHONE_INVALID" })).toBe("phoneInvalid");
    expect(emailListErrorKey({ code: "XX000", message: "details" })).toBe("generic");
  });
});
