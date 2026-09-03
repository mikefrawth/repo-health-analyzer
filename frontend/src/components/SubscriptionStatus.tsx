import type { SubscriptionStatus as Status } from "@/lib/subscription";

/**
 * The signed-in header's billing slot: a "Subscribe" button when there's no
 * active subscription, or the current period's remaining credit balance
 * when there is. Pure presentation -- layout.tsx resolves the subscription
 * and balance server-side.
 */
export function SubscriptionStatus({
  status,
  balance,
}: {
  status: Status | null;
  balance: number | null;
}) {
  if (status !== "active") {
    return (
      <form action="/api/checkout" method="post">
        <button
          type="submit"
          className="text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          Subscribe
        </button>
      </form>
    );
  }

  const credits = balance ?? 0;
  return (
    <span className="text-sm text-slate-500">
      {credits} credit{credits === 1 ? "" : "s"} left
    </span>
  );
}
