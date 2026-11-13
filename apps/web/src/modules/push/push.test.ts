import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdminClient: () => ({ rpc }) }));
const sendNotification = vi.fn();
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...args: unknown[]) => sendNotification(...args) } }));

import { runPushJobs } from "./server";
import { pushText } from "./text";

describe("pushText", () => {
  it("says what the bell says, and opens the same page", () => {
    expect(pushText("order_paid", { product: "Suya" }, "en")).toEqual({ title: "Biqbaq", body: expect.stringContaining("Suya"), url: "/account/orders" });
    expect(pushText("application_approved", { role: "seller" }, "en").body).toContain("Seller");
    expect(pushText("order_paid", { product: "Suya" }, "fr").url).toBe("/fr/account/orders");
  });
  it("gives messages a short line and opens the conversation, never the message itself", () => {
    const id = "00000000-0000-4000-8000-000000000b98";
    expect(pushText("message_to_buyer", { shop: "Ada's Shop", conversation: id }, "en")).toEqual({ title: "Biqbaq", body: "New message from Ada's Shop", url: `/account/messages?c=${id}` });
    expect(pushText("message_to_seller", { shop: "Ada's Shop", conversation: "x/../evil" }, "fr")).toEqual({ title: "Biqbaq", body: "Nouveau message pour Ada's Shop", url: "/fr/account/messages" });
  });
  it("falls back to a general line for anything unknown", () => {
    expect(pushText("something_new", {}, "en").body).toBe("Something changed on your account.");
  });
});

describe("runPushJobs", () => {
  beforeEach(() => {
    rpc.mockReset();
    sendNotification.mockReset();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
  });

  const job = (devices: string[]) => ({
    job_id: "job-1",
    template: "order_paid",
    data: { product: "Suya" },
    tag: null,
    locale: "en",
    devices: devices.map((endpoint) => ({ endpoint, p256dh: "k", auth: "a" })),
  });

  it("sends to each device, forgets gone ones, and completes the job", async () => {
    rpc.mockImplementation(async (name: string) => (name === "claim_push_jobs" ? { data: [job(["https://a", "https://gone"])], error: null } : { data: null, error: null }));
    sendNotification.mockImplementation(async (device: { endpoint: string }) => {
      if (device.endpoint === "https://gone") throw Object.assign(new Error("gone"), { statusCode: 410 });
    });
    expect(await runPushJobs()).toEqual({ claimed: 1, sent: 1, forgotten: 1, failed: 0 });
    const payload = JSON.parse(sendNotification.mock.calls[0][1]);
    expect(payload).toMatchObject({ title: "Biqbaq", url: "/account/orders" });
    expect(rpc).toHaveBeenCalledWith("forget_push_subscription", { p_endpoint: "https://gone" });
    expect(rpc).toHaveBeenCalledWith("touch_push_subscription", { p_endpoint: "https://a" });
    expect(rpc).toHaveBeenCalledWith("complete_background_job", { p_job_id: "job-1" });
  });

  it("retries later when a push service is having trouble", async () => {
    rpc.mockImplementation(async (name: string) => (name === "claim_push_jobs" ? { data: [job(["https://a"])], error: null } : { data: null, error: null }));
    sendNotification.mockRejectedValue(Object.assign(new Error("busy"), { statusCode: 503 }));
    expect((await runPushJobs()).failed).toBe(1);
    expect(rpc).toHaveBeenCalledWith("fail_background_job", { p_job_id: "job-1", p_error: "PUSH_FAILED", p_retry: true });
  });

  it("does nothing without keys", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect(await runPushJobs()).toEqual({ claimed: 0, sent: 0, forgotten: 0, failed: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
