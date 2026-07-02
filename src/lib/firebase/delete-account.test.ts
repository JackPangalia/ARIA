import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteUserAccount } from "@/lib/firebase/delete-account";
import { teardownStripeForUser } from "@/lib/stripe/cleanup";

const recursiveDelete = vi.fn();
const deleteUser = vi.fn();

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => ({
    collection: () => ({ doc: () => ({ path: "users/u1" }) }),
    recursiveDelete,
  }),
  getAdminAuth: () => ({ deleteUser }),
}));
vi.mock("@/lib/composio/client", () => ({ isComposioConfigured: () => false }));
vi.mock("@/lib/composio/tools-cache", () => ({
  invalidateComposioToolsCache: vi.fn(),
}));
vi.mock("@/lib/composio/connections", () => ({
  deleteConnection: vi.fn(),
  listConnectionsForUser: vi.fn(),
}));
vi.mock("@/lib/plan/repository", () => ({
  getPlanStripeIds: vi.fn(async () => ({
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
  })),
}));
vi.mock("@/lib/stripe/cleanup", () => ({ teardownStripeForUser: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  recursiveDelete.mockResolvedValue(undefined);
  deleteUser.mockResolvedValue(undefined);
  vi.mocked(teardownStripeForUser).mockResolvedValue(undefined);
});

describe("deleteUserAccount", () => {
  it("tears down Stripe before deleting Firestore data", async () => {
    await deleteUserAccount("u1");
    expect(teardownStripeForUser).toHaveBeenCalledWith({
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    });
    expect(
      vi.mocked(teardownStripeForUser).mock.invocationCallOrder[0]
    ).toBeLessThan(recursiveDelete.mock.invocationCallOrder[0]);
    expect(deleteUser).toHaveBeenCalledWith("u1");
  });

  it("aborts the deletion when Stripe teardown fails", async () => {
    vi.mocked(teardownStripeForUser).mockRejectedValue(
      new Error("stripe down")
    );
    await expect(deleteUserAccount("u1")).rejects.toThrow("stripe down");
    expect(recursiveDelete).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
