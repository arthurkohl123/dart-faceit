export const PREMIUM_PLANS = ['monthly', 'yearly'] as const;

export type PremiumPlan = (typeof PREMIUM_PLANS)[number];

type PremiumPlanConfiguration = {
  environmentKey: 'STRIPE_PREMIUM_PRICE_ID' | 'STRIPE_PREMIUM_YEARLY_PRICE_ID';
};

export type PremiumPlanEnvironment = {
  STRIPE_PREMIUM_PRICE_ID?: string;
  STRIPE_PREMIUM_YEARLY_PRICE_ID?: string;
};

const PREMIUM_PLAN_CONFIGURATION: Record<PremiumPlan, PremiumPlanConfiguration> = {
  monthly: { environmentKey: 'STRIPE_PREMIUM_PRICE_ID' },
  yearly: { environmentKey: 'STRIPE_PREMIUM_YEARLY_PRICE_ID' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePremiumCheckoutPlan(value: unknown): PremiumPlan | null {
  if (typeof value === 'undefined') return 'monthly';
  return PREMIUM_PLANS.includes(value as PremiumPlan) ? value as PremiumPlan : null;
}

export function parsePremiumCheckoutPayload(payload: unknown): PremiumPlan | null {
  if (!isRecord(payload)) return null;
  return parsePremiumCheckoutPlan(payload.plan);
}

export function getPremiumPlanPriceId(
  plan: PremiumPlan,
  environment?: PremiumPlanEnvironment,
) {
  const environmentKey = PREMIUM_PLAN_CONFIGURATION[plan].environmentKey;
  const value = (environment?.[environmentKey] ?? process.env[environmentKey])?.trim();
  return value || null;
}

export function getConfiguredPremiumPlans(environment?: PremiumPlanEnvironment) {
  return PREMIUM_PLANS.flatMap((plan) => {
    const priceId = getPremiumPlanPriceId(plan, environment);
    return priceId ? [{ plan, priceId }] : [];
  });
}
