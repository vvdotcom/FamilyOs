import { HouseholdSnapshot } from './types';

/** A child's stars: everything earned minus everything spent, from the household's star ledger. */
export function starBalance(household: Pick<HouseholdSnapshot, 'starTransactions'>, memberId?: string | null): number {
  if (!memberId) return 0;
  return (household.starTransactions ?? []).filter((item) => item.memberId === memberId).reduce((sum, item) => sum + item.delta, 0);
}

export type PendingApproval =
  | {
      kind: 'photo';
      id: string;
      memberId: string;
      choreId: string;
      title: string;
      stars: number;
      verdict: 'looks_done' | 'unclear' | 'not_done';
      reason: string;
      photoId?: string | null;
      at: string;
    }
  | { kind: 'reward'; id: string; memberId: string; rewardId: string; title: string; stars: number; at: string };

/** What is waiting for a parent: chore photos and reward requests, oldest first. */
export function pendingApprovals(
  household: Pick<HouseholdSnapshot, 'chores' | 'choreVerifications' | 'redemptions' | 'rewards'>,
): PendingApproval[] {
  const photos: PendingApproval[] = (household.choreVerifications ?? [])
    .filter((item) => item.status === 'pending')
    .map((item) => {
      const chore = household.chores.find((candidate) => candidate.id === item.choreId);
      return {
        kind: 'photo' as const,
        id: item.id,
        memberId: item.memberId,
        choreId: item.choreId,
        title: chore?.title ?? 'Chore',
        stars: chore?.points ?? 1,
        verdict: item.verdict,
        reason: item.reason,
        photoId: item.photoId,
        at: item.submittedAt,
      };
    });
  const rewards: PendingApproval[] = (household.redemptions ?? [])
    .filter((item) => item.status === 'pending')
    .map((item) => ({
      kind: 'reward' as const,
      id: item.id,
      memberId: item.memberId,
      rewardId: item.rewardId,
      title: household.rewards?.find((reward) => reward.id === item.rewardId)?.title ?? 'A reward',
      stars: item.stars,
      at: item.requestedAt,
    }));
  return [...photos, ...rewards].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
