import { createHash } from "crypto";
import { buildMerkleProof, buildMerkleRoot, recomputeRootFromProof } from "./merkle";

function hash(x: string): string {
  return createHash("sha256").update(x).digest("hex");
}

describe("buildMerkleRoot", () => {
  it("is deterministic regardless of input leaf order", () => {
    const leaves = ["a", "b", "c", "d"].map(hash);
    const shuffled = [leaves[2], leaves[0], leaves[3], leaves[1]];
    expect(buildMerkleRoot(leaves)).toBe(buildMerkleRoot(shuffled));
  });

  it("changes when a single leaf changes (tamper-evidence)", () => {
    const leaves = ["a", "b", "c", "d"].map(hash);
    const tampered = [...leaves];
    tampered[1] = hash("B-tampered");
    expect(buildMerkleRoot(leaves)).not.toBe(buildMerkleRoot(tampered));
  });

  it("handles an odd number of leaves without throwing", () => {
    const leaves = ["a", "b", "c"].map(hash);
    expect(() => buildMerkleRoot(leaves)).not.toThrow();
  });

  it("throws on an empty batch rather than silently returning a root", () => {
    expect(() => buildMerkleRoot([])).toThrow();
  });

  it("returns the leaf itself for a single-leaf batch", () => {
    const leaf = hash("solo");
    expect(buildMerkleRoot([leaf])).toBe(leaf);
  });
});

describe("buildMerkleProof / recomputeRootFromProof", () => {
  it("every leaf's proof recomputes to the real root — even count", () => {
    const leaves = ["w", "x", "y", "z"].map(hash);
    const root = buildMerkleRoot(leaves);
    for (const leaf of leaves) {
      const { proof, siblingIsLeft } = buildMerkleProof(leaves, leaf);
      expect(recomputeRootFromProof(leaf, proof, siblingIsLeft)).toBe(root);
    }
  });

  it("every leaf's proof recomputes to the real root — odd count (exercises self-duplication)", () => {
    const leaves = ["a", "b", "c", "d", "e"].map(hash);
    const root = buildMerkleRoot(leaves);
    for (const leaf of leaves) {
      const { proof, siblingIsLeft } = buildMerkleProof(leaves, leaf);
      expect(recomputeRootFromProof(leaf, proof, siblingIsLeft)).toBe(root);
    }
  });

  it("produces an empty proof for a single-leaf batch, and the leaf IS the root", () => {
    const leaf = hash("solo");
    const { proof } = buildMerkleProof([leaf], leaf);
    expect(proof).toHaveLength(0);
    expect(recomputeRootFromProof(leaf, [], [])).toBe(leaf);
  });

  it("a proof is O(log n): 1000 leaves need at most 10 sibling hashes", () => {
    const leaves = Array.from({ length: 1000 }, (_, i) => hash(`event-${i}`));
    const target = leaves[777];
    const { proof } = buildMerkleProof(leaves, target);
    expect(proof.length).toBeLessThanOrEqual(10);
  });

  it("recomputing with a tampered leaf does NOT match the real root", () => {
    const leaves = ["a", "b", "c", "d"].map(hash);
    const root = buildMerkleRoot(leaves);
    const { proof, siblingIsLeft } = buildMerkleProof(leaves, leaves[2]);
    const wrongLeaf = hash("not-actually-in-the-batch");
    expect(recomputeRootFromProof(wrongLeaf, proof, siblingIsLeft)).not.toBe(root);
  });

  it("recomputing with a tampered sibling in the proof does NOT match the real root", () => {
    const leaves = ["a", "b", "c", "d"].map(hash);
    const root = buildMerkleRoot(leaves);
    const { proof, siblingIsLeft } = buildMerkleProof(leaves, leaves[0]);
    const tamperedProof = [...proof];
    tamperedProof[0] = hash("forged-sibling");
    expect(recomputeRootFromProof(leaves[0], tamperedProof, siblingIsLeft)).not.toBe(root);
  });

  it("throws when the target leaf isn't in the batch", () => {
    const leaves = ["a", "b", "c"].map(hash);
    expect(() => buildMerkleProof(leaves, hash("not-in-batch"))).toThrow();
  });
});
