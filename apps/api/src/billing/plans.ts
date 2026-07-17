import type { Plan } from '@crm/shared'

export const PAYABLE_PLANS = ['pro', 'business', 'master'] as const
export type PayablePlan = (typeof PAYABLE_PLANS)[number]

export const PLAN_CATALOG: Record<PayablePlan, { label: string; priceUsd: number }> = {
  pro:      { label: 'Pro',      priceUsd: 10 },
  business: { label: 'Business', priceUsd: 35 },
  master:   { label: 'Master',   priceUsd: 80 },
}

export function isPayablePlan(plan: string): plan is PayablePlan {
  return (PAYABLE_PLANS as readonly string[]).includes(plan)
}

export function isKnownPlan(plan: string): plan is Plan {
  return plan === 'free' || plan === 'enterprise' || isPayablePlan(plan)
}
