import { calculateReputation } from "./reputation-calculator";

describe("calculateReputation", () => {
  it("reports score 0 below the minimum sample size, with honest sampleSize", () => {
    const result = calculateReputation({
      confirmedCompletedCount: 1,
      onTimeCompletedCount: 1,
      cancelledCount: 0,
      disputesOpenedAgainst: 0,
      disputesUpheldAgainst: 0,
      ratingsSum: 5,
      ratingsCount: 1,
      hasVerifiedCredential: false,
    });
    expect(result.score).toBe(0);
    expect(result.sampleSize).toBe(1);
  });

  it("rewards a strong, reliable track record once past the sample floor", () => {
    const result = calculateReputation({
      confirmedCompletedCount: 10,
      onTimeCompletedCount: 10,
      cancelledCount: 0,
      disputesOpenedAgainst: 0,
      disputesUpheldAgainst: 0,
      ratingsSum: 50,
      ratingsCount: 10,
      hasVerifiedCredential: true,
    });
    expect(result.score).toBeGreaterThan(90);
  });

  it("penalizes upheld disputes", () => {
    const clean = calculateReputation({
      confirmedCompletedCount: 10,
      onTimeCompletedCount: 10,
      cancelledCount: 0,
      disputesOpenedAgainst: 0,
      disputesUpheldAgainst: 0,
      ratingsSum: 50,
      ratingsCount: 10,
      hasVerifiedCredential: false,
    });
    const disputed = calculateReputation({
      ...{
        confirmedCompletedCount: 10,
        onTimeCompletedCount: 10,
        cancelledCount: 0,
        disputesOpenedAgainst: 4,
        ratingsSum: 50,
        ratingsCount: 10,
        hasVerifiedCredential: false,
      },
      disputesUpheldAgainst: 4,
    });
    expect(disputed.score).toBeLessThan(clean.score);
  });

  it("never exceeds 100 or drops below 0", () => {
    const result = calculateReputation({
      confirmedCompletedCount: 50,
      onTimeCompletedCount: 50,
      cancelledCount: 0,
      disputesOpenedAgainst: 50,
      disputesUpheldAgainst: 50,
      ratingsSum: 0,
      ratingsCount: 0,
      hasVerifiedCredential: false,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("is deterministic for identical input", () => {
    const input = {
      confirmedCompletedCount: 5,
      onTimeCompletedCount: 4,
      cancelledCount: 1,
      disputesOpenedAgainst: 1,
      disputesUpheldAgainst: 0,
      ratingsSum: 20,
      ratingsCount: 5,
      hasVerifiedCredential: false,
    };
    expect(calculateReputation(input)).toEqual(calculateReputation({ ...input }));
  });
});
