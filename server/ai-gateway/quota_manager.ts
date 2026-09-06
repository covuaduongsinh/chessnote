/**
 * Subscription Tier & Quota Manager for ChessNote SaaS (MIT License)
 */

export type SubscriptionTier = "free" | "pro" | "master";

export interface UserSubscription {
  userId: string;
  tier: SubscriptionTier;
  expiresAt: string; // ISO Date
  monthlyQueriesUsed: number;
  monthlyLimit: number;
  unlimitedArasan: boolean;
}

export const TIER_LIMITS: Record<SubscriptionTier, { monthlyLimit: number; priceMonthly: number }> = {
  free: { monthlyLimit: 50, priceMonthly: 0 },
  pro: { monthlyLimit: 500, priceMonthly: 9 },
  master: { monthlyLimit: 2500, priceMonthly: 19 },
};

export class QuotaManager {
  private users = new Map<string, UserSubscription>();

  getUser(userId: string): UserSubscription {
    let user = this.users.get(userId);
    if (!user) {
      user = {
        userId,
        tier: "free",
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        monthlyQueriesUsed: 0,
        monthlyLimit: TIER_LIMITS.free.monthlyLimit,
        unlimitedArasan: true,
      };
      this.users.set(userId, user);
    }
    return user;
  }

  canMakeRequest(userId: string): boolean {
    const user = this.getUser(userId);
    return user.monthlyQueriesUsed < user.monthlyLimit;
  }

  recordUsage(userId: string): boolean {
    const user = this.getUser(userId);
    if (user.monthlyQueriesUsed >= user.monthlyLimit) return false;
    user.monthlyQueriesUsed++;
    return true;
  }

  upgradeTier(userId: string, tier: SubscriptionTier, durationDays: number = 30) {
    const user = this.getUser(userId);
    user.tier = tier;
    user.monthlyLimit = TIER_LIMITS[tier].monthlyLimit;
    user.expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();
  }
}
