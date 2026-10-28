import { createHash } from "crypto";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Deterministic Merkle root over sha256 leaf hashes: sorts leaves (so batch
 * order never affects the root), then repeatedly hashes adjacent pairs
 * (sha256 of their hex strings concatenated as text, not raw bytes —
 * deliberate, see MerkleProof below), duplicating the last node when a
 * level has an odd count, until one hash remains.
 */
export function buildMerkleRoot(leafHashes: string[]): string {
  if (leafHashes.length === 0) {
    throw new Error("Cannot build a Merkle root from an empty event batch.");
  }
  let level = [...leafHashes].sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? level[i];
      next.push(sha256Hex(left + right));
    }
    level = next;
  }
  return level[0];
}

export interface MerkleProof {
  leaf: string;
  /** Sibling hash at each level, root-ward from the leaf. */
  proof: string[];
  /** For proof[i]: true if that sibling sits to the LEFT of the running hash at that level. */
  siblingIsLeft: boolean[];
}

/**
 * Builds a compact inclusion proof for one leaf: just the sibling hash at
 * each level (O(log n) hashes), not the whole batch. Anyone holding only
 * this leaf's own hash plus the proof can recompute the root with
 * `verifyMerkleProof` — they never need the other leaves' hashes. This is
 * the actual point of a Merkle tree over a flat hash-of-everything: an
 * event's inclusion can be checked without exposing or even knowing about
 * any other event in the batch.
 */
export function buildMerkleProof(leafHashes: string[], targetLeaf: string): MerkleProof {
  let level = [...leafHashes].sort();
  let index = level.indexOf(targetLeaf);
  if (index === -1) {
    throw new Error("Leaf not found in this batch.");
  }

  const proof: string[] = [];
  const siblingIsLeft: boolean[] = [];

  while (level.length > 1) {
    const next: string[] = [];
    let nextIndex = -1;
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? level[i]; // duplicate last node on odd counts — mirrors buildMerkleRoot exactly
      next.push(sha256Hex(left + right));
      if (i === index) {
        proof.push(right);
        siblingIsLeft.push(false);
        nextIndex = next.length - 1;
      } else if (i + 1 === index) {
        proof.push(left);
        siblingIsLeft.push(true);
        nextIndex = next.length - 1;
      }
    }
    level = next;
    index = nextIndex;
  }

  return { leaf: targetLeaf, proof, siblingIsLeft };
}

/** Recomputes the root a leaf + proof implies. Compare the result to the anchor's real batchRoot yourself. */
export function recomputeRootFromProof(leaf: string, proof: string[], siblingIsLeft: boolean[]): string {
  let hash = leaf;
  for (let i = 0; i < proof.length; i++) {
    hash = siblingIsLeft[i] ? sha256Hex(proof[i] + hash) : sha256Hex(hash + proof[i]);
  }
  return hash;
}
