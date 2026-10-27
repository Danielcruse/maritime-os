import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { generateMaritimeId } from "./maritime-id";
import { AuditService } from "../audit/audit.service";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const MAX_MARITIME_ID_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      // Deliberately generic: do not confirm or deny which field collided.
      throw new ConflictException("Registration could not be completed with the supplied details.");
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.createUserWithProfile(dto, passwordHash);

    await this.auditService.record({
      actorId: user.id,
      eventType: "user.registered",
      entityType: "user",
      entityId: user.id,
      payload: { email: user.email },
    });

    const tokens = await this.issueTokens(user.id, user.email);
    return { user: { id: user.id, email: user.email }, ...tokens };
  }

  private async createUserWithProfile(dto: RegisterDto, passwordHash: string) {
    for (let attempt = 0; attempt < MAX_MARITIME_ID_ATTEMPTS; attempt++) {
      const maritimeId = generateMaritimeId(dto.countryCode);
      try {
        return await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email: dto.email.toLowerCase(),
              passwordHash,
            },
          });
          await tx.userProfile.create({
            data: {
              userId: user.id,
              maritimeId,
              displayName: dto.displayName,
              countryCode: dto.countryCode.toUpperCase(),
            },
          });
          await tx.pointsAccount.create({ data: { userId: user.id } });
          return user;
        });
      } catch (err: any) {
        // Unique constraint on maritime_id: retry with a fresh one.
        if (err?.code === "P2002" && err?.meta?.target?.includes?.("maritime_id")) {
          continue;
        }
        throw err;
      }
    }
    throw new ConflictException("Could not allocate a unique Maritime ID. Please try again.");
  }

  async login(dto: LoginDto): Promise<TokenPair & { user: { id: string; email: string } }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || user.status !== "active") {
      throw new UnauthorizedException("Invalid email or password.");
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    const tokens = await this.issueTokens(user.id, user.email);
    return { user: { id: user.id, email: user.email }, ...tokens };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; email: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token.");
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash, revokedAt: null },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token is no longer valid.");
    }

    // Rotate: revoke the used token, issue a new pair.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(payload.sub, payload.email);
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(userId: string, email: string): Promise<TokenPair> {
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, email },
      {
        secret: this.configService.get<string>("JWT_ACCESS_SECRET"),
        expiresIn: this.configService.get<string>("JWT_ACCESS_TTL") ?? "15m",
      },
    );
    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, email },
      {
        secret: this.configService.get<string>("JWT_REFRESH_SECRET"),
        expiresIn: this.configService.get<string>("JWT_REFRESH_TTL") ?? "30d",
      },
    );

    const ttlMs = this.parseTtlMs(this.configService.get<string>("JWT_REFRESH_TTL") ?? "30d");
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private parseTtlMs(ttl: string): number {
    const match = /^(\d+)(ms|s|m|h|d)$/.exec(ttl);
    if (!match) return 30 * 24 * 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return value * multipliers[unit];
  }

  /** Exposed for anywhere a random opaque token is needed outside JWT (not currently used, kept minimal). */
  static randomOpaqueToken(): string {
    return randomBytes(32).toString("base64url");
  }
}
