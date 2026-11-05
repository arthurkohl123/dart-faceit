type StripeSubscriptionItem = {
  current_period_end?: number | null;
};

type StripeSubscriptionPayload = {
  current_period_end?: number | null;
  items?: { data?: StripeSubscriptionItem[] | null } | null;
};

export function getStripeSubscriptionPeriodEnd(subscription: StripeSubscriptionPayload): number | null {
  const itemPeriodEnds = (subscription.items?.data || [])
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (itemPeriodEnds.length > 0) return Math.max(...itemPeriodEnds);

  return typeof subscription.current_period_end === 'number' && Number.isFinite(subscription.current_period_end)
    ? subscription.current_period_end
    : null;
}

type SubscriptionEventGuardInput = {
  storedSubscriptionId?: string | null;
  storedSubscriptionStatus?: string | null;
  storedLastEventAt?: string | null;
  incomingSubscriptionId?: string | null;
  incomingSubscriptionStatus: string;
  incomingEventAt: string;
};

export function getStripeSubscriptionEventIgnoreReason(input: SubscriptionEventGuardInput): 'inactive_sibling_subscription' | 'stale_subscription_event' | null {
  const activeStatuses = new Set(['active', 'trialing']);
  const hasDifferentSubscription = Boolean(
    input.storedSubscriptionId
    && input.incomingSubscriptionId
    && input.storedSubscriptionId !== input.incomingSubscriptionId,
  );

  if (
    hasDifferentSubscription
    && activeStatuses.has(input.storedSubscriptionStatus || '')
    && !activeStatuses.has(input.incomingSubscriptionStatus)
  ) {
    return 'inactive_sibling_subscription';
  }

  const isSameSubscription = Boolean(
    input.storedSubscriptionId
    && input.incomingSubscriptionId
    && input.storedSubscriptionId === input.incomingSubscriptionId,
  );

  if (
    isSameSubscription
    && input.storedLastEventAt
    && new Date(input.storedLastEventAt).getTime() > new Date(input.incomingEventAt).getTime()
  ) {
    return 'stale_subscription_event';
  }

  return null;
}
