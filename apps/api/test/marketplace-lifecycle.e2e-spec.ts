/**
 * End-to-end acceptance test for the single journey the blueprint names as
 * the first proof point: register -> verify org -> publish listing ->
 * apply -> award -> submit evidence -> confirm -> points + reputation.
 *
 * REQUIRES A LIVE POSTGRES DATABASE matching DATABASE_URL (see .env.example)
 * with migrations applied:
 *
 *   docker compose up -d db
 *   npm run prisma:migrate:deploy
 *   npm run test:e2e -w apps/api
 *
 * This suite could not be executed in the sandbox this project was first
 * built in (no Docker / local Postgres available there) — see
 * docs/architecture.md "Known limitations / what has and hasn't run".
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Marketplace lifecycle (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  function uniqueEmail(prefix: string) {
    return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`;
  }

  async function registerAndGetToken(prefix: string, countryCode = "NG") {
    const res = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email: uniqueEmail(prefix),
      password: "correct-horse-battery-staple",
      displayName: `${prefix} user`,
      countryCode,
    });
    expect(res.status).toBe(201);
    return { token: res.body.data.accessToken as string, userId: res.body.data.user.id as string };
  }

  async function createVerifiedOrg(token: string, legalName: string) {
    const createRes = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({ legalName, countryCode: "NG" });
    expect(createRes.status).toBe(201);
    const orgId = createRes.body.data.id as string;

    const vcaseRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/verification`)
      .set("Authorization", `Bearer ${token}`)
      .send({ documentKeys: ["docs/registration.pdf"] });
    expect(vcaseRes.status).toBe(201);
    const caseId = vcaseRes.body.data.id as string;

    // Directly promote to verified via Prisma, bypassing the admin allowlist
    // guard in this test — a real admin flow is covered by
    // organizations.service unit tests instead.
    await prisma.verificationCase.update({ where: { id: caseId }, data: { decision: "approved" } });
    await prisma.organization.update({ where: { id: orgId }, data: { verificationStatus: "verified" } });

    return orgId;
  }

  it("runs the full register -> award -> confirm -> points journey exactly once", async () => {
    const employer = await registerAndGetToken("employer");
    const carrier = await registerAndGetToken("carrier");

    const employerOrgId = await createVerifiedOrg(employer.token, "Lagos Freight Co");
    const carrierOrgId = await createVerifiedOrg(carrier.token, "Accra Carriers Ltd");

    const listingRes = await request(app.getHttpServer())
      .post(`/api/v1/listings/organizations/${employerOrgId}`)
      .set("Authorization", `Bearer ${employer.token}`)
      .send({
        title: "Container freight forwarding",
        origin: { countryCode: "NG", portCode: "NGLOS" },
        destination: { countryCode: "GH", portCode: "GHTEM" },
        cargoSummary: "20ft container, dry goods",
        currency: "USD",
      });
    expect(listingRes.status).toBe(201);
    const listingId = listingRes.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/listings/${listingId}/publish/organizations/${employerOrgId}`)
      .set("Authorization", `Bearer ${employer.token}`)
      .expect(201);

    const applyRes = await request(app.getHttpServer())
      .post(`/api/v1/listings/${listingId}/applications/organizations/${carrierOrgId}`)
      .set("Authorization", `Bearer ${carrier.token}`)
      .send({ quoteAmount: "1200.00", currency: "USD" });
    expect(applyRes.status).toBe(201);
    const applicationId = applyRes.body.data.id as string;

    const awardRes = await request(app.getHttpServer())
      .post(`/api/v1/listings/${listingId}/applications/${applicationId}/award/organizations/${employerOrgId}`)
      .set("Authorization", `Bearer ${employer.token}`)
      .expect(201);
    const assignmentId = awardRes.body.data.id as string;

    // Retried award (e.g. a client timeout retry) must not create a second
    // assignment or error.
    const repeatAwardRes = await request(app.getHttpServer())
      .post(`/api/v1/listings/${listingId}/applications/${applicationId}/award/organizations/${employerOrgId}`)
      .set("Authorization", `Bearer ${employer.token}`);
    expect(repeatAwardRes.status).toBe(201);
    expect(repeatAwardRes.body.data.id).toBe(assignmentId);

    await request(app.getHttpServer())
      .post(`/api/v1/assignments/${assignmentId}/evidence/organizations/${carrierOrgId}`)
      .set("Authorization", `Bearer ${carrier.token}`)
      .send({ storageKey: "evidence/pod.pdf", contentHash: "a".repeat(64) })
      .expect(201);

    // The carrier (who did the work) cannot confirm their own completion.
    await request(app.getHttpServer())
      .post(`/api/v1/assignments/${assignmentId}/confirm/organizations/${carrierOrgId}`)
      .set("Authorization", `Bearer ${carrier.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/v1/assignments/${assignmentId}/confirm/organizations/${employerOrgId}`)
      .set("Authorization", `Bearer ${employer.token}`)
      .expect(201);

    // Repeated confirm (retry) must not award points twice.
    await request(app.getHttpServer())
      .post(`/api/v1/assignments/${assignmentId}/confirm/organizations/${employerOrgId}`)
      .set("Authorization", `Bearer ${employer.token}`)
      .expect(201);

    const pointsRes = await request(app.getHttpServer())
      .get("/api/v1/me/points")
      .set("Authorization", `Bearer ${carrier.token}`)
      .expect(200);
    // Prisma's Decimal (decimal.js) serializes to its shortest exact
    // representation, dropping trailing zeros — "50.00" in Postgres
    // becomes "50" over the wire, not a precision loss.
    expect(pointsRes.body.data.balance).toBe("50");
    expect(pointsRes.body.data.entries).toHaveLength(1);

    const auditRes = await request(app.getHttpServer())
      .get(`/api/v1/audit/assignment/${assignmentId}`)
      .set("Authorization", `Bearer ${employer.token}`)
      .expect(200);
    const eventTypes = auditRes.body.data.map((e: any) => e.eventType);
    expect(eventTypes).toEqual(
      expect.arrayContaining(["assignment.awarded", "assignment.evidence_submitted", "assignment.confirmed"]),
    );
  });
});
