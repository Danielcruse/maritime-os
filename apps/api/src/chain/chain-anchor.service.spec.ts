import { ChainAnchorService } from "./chain-anchor.service";

describe("ChainAnchorService.buildMerkleRoot", () => {
  const service = new ChainAnchorService({} as any, {} as any);

  it("is deterministic regardless of input leaf order", () => {
    const leaves = ["a", "b", "c", "d"].map((x) => Buffer.from(x).toString("hex"));
    const shuffled = [leaves[2], leaves[0], leaves[3], leaves[1]];
    expect(service.buildMerkleRoot(leaves)).toBe(service.buildMerkleRoot(shuffled));
  });

  it("changes when a single leaf changes (tamper-evidence)", () => {
    const leaves = ["a", "b", "c", "d"].map((x) => Buffer.from(x).toString("hex"));
    const tampered = [...leaves];
    tampered[1] = Buffer.from("B-tampered").toString("hex");
    expect(service.buildMerkleRoot(leaves)).not.toBe(service.buildMerkleRoot(tampered));
  });

  it("handles an odd number of leaves without throwing", () => {
    const leaves = ["a", "b", "c"].map((x) => Buffer.from(x).toString("hex"));
    expect(() => service.buildMerkleRoot(leaves)).not.toThrow();
  });

  it("throws on an empty batch rather than silently returning a root", () => {
    expect(() => service.buildMerkleRoot([])).toThrow();
  });
});
