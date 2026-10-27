import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { canonicalPayloadHash, signPayloadHash, verifySignature } from "./credential-signing";
import { IssueCredentialDto } from "./dto/issue-credential.dto";
import { RevokeCredentialDto } from "./dto/revoke-credential.dto";

/**
 * MVP credential issuance. Any verified organization can currently issue —
 * there is no separate "authorized issuer" designation yet (blueprint 4/10
 * calls for one). That is a deliberate scope cut for the first vertical
 * slice, not an oversight: see docs/architecture.md "Known limitations".
 */
@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly organizationsService: OrganizationsService,
    private readonly configService: ConfigService,
  ) {}

  async issue(issuerOrgId: string, userId: string, dto: IssueCredentialDto) {
    await this.organizationsService.assertVerifiedOwner(issuerOrgId);

    const privateKey = this.configService.get<string>("CREDENTIAL_SIGNING_PRIVATE_KEY");
    if (!privateKey) {
      throw new BadRequestException(
        "Credential signing is not configured on this server (CREDENTIAL_SIGNING_PRIVATE_KEY).",
      );
    }

    const credentialId = randomUUID();
    const issuedAt = new Date();
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    const payloadHash = canonicalPayloadHash({
      credentialId,
      subjectId: dto.subjectUserId,
      issuerOrgId,
      credentialType: dto.credentialType,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    });
    const signature = await signPayloadHash(payloadHash, privateKey);

    return this.prisma.$transaction(async (tx) => {
      const credential = await tx.credential.create({
        data: {
          id: credentialId,
          subjectId: dto.subjectUserId,
          issuerOrgId,
          credentialType: dto.credentialType,
          status: "active",
          issuedAt,
          expiresAt,
          signature,
          payloadHash,
        },
      });

      if (dto.evidenceStorageKeys?.length) {
        await tx.credentialEvidence.createMany({
          data: dto.evidenceStorageKeys.map((key) => ({
            credentialId,
            storageKey: key,
            contentHash: payloadHash, // placeholder until per-file hashing lands
          })),
        });
      }

      await this.auditService.record(
        {
          actorId: userId,
          eventType: "credential.issued",
          entityType: "credential",
          entityId: credentialId,
          payload: { subjectId: dto.subjectUserId, issuerOrgId, credentialType: dto.credentialType },
        },
        tx,
      );

      return credential;
    });
  }

  /**
   * Public, privacy-limited verification: confirms signature integrity and
   * current status without returning evidence documents or unrelated
   * profile data about the subject.
   */
  async verify(credentialId: string) {
    const credential = await this.prisma.credential.findUnique({ where: { id: credentialId } });
    if (!credential) throw new NotFoundException("Credential not found.");

    const publicKey = this.configService.get<string>("CREDENTIAL_SIGNING_PUBLIC_KEY");
    const signatureValid = publicKey
      ? await verifySignature(credential.payloadHash, credential.signature, publicKey)
      : null;

    const now = new Date();
    let effectiveStatus: string = credential.status;
    if (credential.status === "active" && credential.expiresAt && credential.expiresAt < now) {
      effectiveStatus = "expired";
    }

    return {
      credentialId: credential.id,
      credentialType: credential.credentialType,
      issuerOrgId: credential.issuerOrgId,
      issuedAt: credential.issuedAt,
      expiresAt: credential.expiresAt,
      status: effectiveStatus,
      signatureValid,
    };
  }

  async revoke(credentialId: string, issuerOrgId: string, userId: string, dto: RevokeCredentialDto) {
    return this.prisma.$transaction(async (tx) => {
      const credential = await tx.credential.findUnique({ where: { id: credentialId } });
      if (!credential) throw new NotFoundException("Credential not found.");
      if (credential.issuerOrgId !== issuerOrgId) {
        throw new ForbiddenException("Only the issuing organization may revoke this credential.");
      }
      if (credential.status === "revoked") {
        return credential; // idempotent
      }

      const updated = await tx.credential.update({
        where: { id: credentialId },
        data: { status: "revoked", revokedAt: new Date(), revocationReason: dto.reason },
      });

      await this.auditService.record(
        {
          actorId: userId,
          eventType: "credential.revoked",
          entityType: "credential",
          entityId: credentialId,
          payload: { reason: dto.reason },
        },
        tx,
      );

      return updated;
    });
  }
}
