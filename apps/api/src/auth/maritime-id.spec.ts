import { generateMaritimeId } from "./maritime-id";

describe("generateMaritimeId", () => {
  it("produces the MID-<COUNTRY>-<6 chars> shape", () => {
    const id = generateMaritimeId("ng");
    expect(id).toMatch(/^MID-NG-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("uppercases the country code", () => {
    expect(generateMaritimeId("gh").startsWith("MID-GH-")).toBe(true);
  });

  it("never emits visually ambiguous characters (0/O/1/I) in the generated suffix", () => {
    for (let i = 0; i < 200; i++) {
      const id = generateMaritimeId("ng");
      const suffix = id.split("-")[2];
      expect(suffix).not.toMatch(/[01OI]/);
    }
  });
});
