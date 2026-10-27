/**
 * Minimal seed: one verified employer org, one verified carrier org, and a
 * published listing — enough to click through the marketplace by hand
 * after `npm run prisma:migrate` without registering everything manually.
 *
 * Run with: npm run prisma:seed
 */
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash("correct-horse-battery-staple");

  const employerUser = await prisma.user.upsert({
    where: { email: "employer@example.test" },
    update: {},
    create: {
      email: "employer@example.test",
      passwordHash,
      profile: {
        create: { maritimeId: "MID-NG-SEED01", displayName: "Lagos Freight Co. Admin", countryCode: "NG" },
      },
      pointsAccount: { create: {} },
    },
  });

  const carrierUser = await prisma.user.upsert({
    where: { email: "carrier@example.test" },
    update: {},
    create: {
      email: "carrier@example.test",
      passwordHash,
      profile: {
        create: { maritimeId: "MID-GH-SEED02", displayName: "Accra Carriers Ltd Admin", countryCode: "GH" },
      },
      pointsAccount: { create: {} },
    },
  });

  const employerOrg = await prisma.organization.upsert({
    where: { org_country_regnum_unique: { countryCode: "NG", registrationNumber: "RC-SEED-001" } },
    update: {},
    create: {
      legalName: "Lagos Freight Co",
      registrationNumber: "RC-SEED-001",
      countryCode: "NG",
      verificationStatus: "verified",
      members: { create: { userId: employerUser.id, role: "owner" } },
    },
  });

  const carrierOrg = await prisma.organization.upsert({
    where: { org_country_regnum_unique: { countryCode: "GH", registrationNumber: "RC-SEED-002" } },
    update: {},
    create: {
      legalName: "Accra Carriers Ltd",
      registrationNumber: "RC-SEED-002",
      countryCode: "GH",
      verificationStatus: "verified",
      members: { create: { userId: carrierUser.id, role: "owner" } },
    },
  });

  await prisma.freightListing.create({
    data: {
      organizationId: employerOrg.id,
      title: "Container freight forwarding — Lagos to Tema",
      origin: { countryCode: "NG", portCode: "NGLOS" },
      destination: { countryCode: "GH", portCode: "GHTEM" },
      cargoSummary: "One 20ft container, dry goods, 8 tonnes",
      currency: "USD",
      status: "open",
    },
  });

  console.log("Seed complete:");
  console.log(`  employer@example.test / correct-horse-battery-staple (org ${employerOrg.id})`);
  console.log(`  carrier@example.test  / correct-horse-battery-staple (org ${carrierOrg.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
