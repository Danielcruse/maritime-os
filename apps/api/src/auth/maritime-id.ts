import { randomInt } from "crypto";

/**
 * Generates a Maritime ID: MID-<ISO country>-<6 base32 chars>, e.g. MID-NG-7K3QX9.
 * Collisions are handled by the caller re-rolling on a unique-constraint violation —
 * this function only guarantees *shape*, not uniqueness, which is the database's job.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity

export function generateMaritimeId(countryCode: string): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return `MID-${countryCode.toUpperCase()}-${suffix}`;
}
