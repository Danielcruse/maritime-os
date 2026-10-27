export const REPUTATION_SCORE_VERSION = "2026-10-27.1";

export interface ReputationMetricsInput {
  confirmedCompletedCount: number;
  onTimeCompletedCount: number;
  cancelledCount: number;
  disputesOpenedAgainst: number;
  disputesUpheldAgainst: number;
  ratingsSum: number;
  ratingsCount: number;
  hasVerifiedCredential: boolean;
}

export interface ReputationMetricsOutput extends ReputationMetricsInput {
  onTimeRate: number | null;
  cancellationRate: number | null;
  disputeRate: number | null;
  averageRating: number | null;
}

export interface ReputationResult {
  scoreVersion: string;
  score: number;
  sampleSize: number;
  metrics: ReputationMetricsOutput;
}

/**
 * Pure, deterministic, versioned reputation calculation (blueprint 7.1 and
 * 11.3 "reproducible from the underlying evidence and rules version").
 * Never mutates anything — callers persist the result as a new
 * ReputationSnapshot row. Changing the formula requires bumping
 * REPUTATION_SCORE_VERSION, never editing this function's output in place
 * for historical snapshots.
 *
 * Deliberately conservative against small samples: an org with fewer than
 * MIN_SAMPLE_FOR_SCORE completed assignments gets score = null-equivalent
 * (0) with sampleSize reported honestly, so a single lucky transaction can't
 * produce a misleadingly high score.
 */
const MIN_SAMPLE_FOR_SCORE = 3;

export function calculateReputation(input: ReputationMetricsInput): ReputationResult {
  const totalAssignments = input.confirmedCompletedCount + input.cancelledCount;

  const onTimeRate =
    input.confirmedCompletedCount > 0 ? input.onTimeCompletedCount / input.confirmedCompletedCount : null;
  const cancellationRate = totalAssignments > 0 ? input.cancelledCount / totalAssignments : null;
  const disputeRate =
    input.confirmedCompletedCount > 0 ? input.disputesOpenedAgainst / input.confirmedCompletedCount : null;
  const averageRating = input.ratingsCount > 0 ? input.ratingsSum / input.ratingsCount : null;

  const sampleSize = input.confirmedCompletedCount;

  let score = 0;
  if (sampleSize >= MIN_SAMPLE_FOR_SCORE) {
    const ratingComponent = averageRating !== null ? (averageRating / 5) * 55 : 27.5; // out of 55
    const reliabilityComponent = (onTimeRate ?? 0.5) * 35; // out of 35
    const disputePenalty = (input.disputesUpheldAgainst / Math.max(sampleSize, 1)) * 20;
    const credentialBonus = input.hasVerifiedCredential ? 10 : 0; // out of 10 — max achievable is 100

    score = Math.max(0, Math.min(100, ratingComponent + reliabilityComponent - disputePenalty + credentialBonus));
  }

  return {
    scoreVersion: REPUTATION_SCORE_VERSION,
    score: Math.round(score * 1000) / 1000,
    sampleSize,
    metrics: {
      ...input,
      onTimeRate,
      cancellationRate,
      disputeRate,
      averageRating,
    },
  };
}
