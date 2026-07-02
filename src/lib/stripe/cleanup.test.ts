import { beforeEach, describe, expect, it, vi } from "vitest";
import { teardownStripeForUser } from "@/lib/stripe/cleanup";
import { getStripe } from "@/lib/stripe/client";
import { isStripeConfigured } from "@/lib/stripe/config";

vi.mock("@/lib/stripe/client", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/stripe/config", () => ({ isStripeConfigured: vi.fn() }));

const cancel = vi.fn();
const del = vi.fn();

function resourceMissing(): Error & { code: string } {
  return Object.assign(new Error("No such resource"), {
    code: "resource_missing",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isStripeConfigured).mockReturnValue(true);
  vi.mocked(getStripe).mockReturnValue({
    subscriptions: { cancel },
    customers: { del },
  } as unknown as ReturnType<typeof getStripe>);
  cancel.mockResolvedValue({});
  del.mockResolvedValue({});
});

describe("teardownStripeForUser", () => {
  it("cancels the subscription then deletes the customer", async () => {
    await teardownStripeForUser({
      stripeSubscriptionId: "sub_1",
      stripeCustomerId: "cus_1",
    });
    expect(cancel).toHaveBeenCalledWith("sub_1");
    expect(del).toHaveBeenCalledWith("cus_1");
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
      del.mock.invocationCallOrder[0]
    );
  });

  it("is a no-op when Stripe is not configured", async () => {
    vi.mocked(isStripeConfigured).mockReturnValue(false);
    await teardownStripeForUser({
      stripeSubscriptionId: "sub_1",
      stripeCustomerId: "cus_1",
    });
    expect(getStripe).not.toHaveBeenCalled();
  });

  it("is a no-op when there are no Stripe ids", async () => {
    await teardownStripeForUser({
      stripeSubscriptionId: null,
      stripeCustomerId: null,
    });
    expect(cancel).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("treats already-gone resources as success", async () => {
    cancel.mockRejectedValue(resourceMissing());
    del.mockRejectedValue(resourceMissing());
    await expect(
      teardownStripeForUser({
        stripeSubscriptionId: "sub_1",
        stripeCustomerId: "cus_1",
      })
    ).resolves.toBeUndefined();
  });

  it("throws on real Stripe failures so the caller aborts deletion", async () => {
    cancel.mockRejectedValue(new Error("stripe down"));
    await expect(
      teardownStripeForUser({
        stripeSubscriptionId: "sub_1",
        stripeCustomerId: "cus_1",
      })
    ).rejects.toThrow("stripe down");
    expect(del).not.toHaveBeenCalled();
  });
});
