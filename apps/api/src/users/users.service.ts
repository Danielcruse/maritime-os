import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwnProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, pointsAccount: true },
    });
    if (!user) throw new NotFoundException("User not found.");
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      maritimeId: user.profile?.maritimeId,
      displayName: user.profile?.displayName,
      countryCode: user.profile?.countryCode,
      profileData: user.profile?.profileData,
      pointsBalance: user.pointsAccount?.balanceCached,
    };
  }

  async getOwnOrganizations(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId, status: "active" },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });
    return memberships.map((m) => ({
      id: m.organization.id,
      legalName: m.organization.legalName,
      countryCode: m.organization.countryCode,
      verificationStatus: m.organization.verificationStatus,
      role: m.role,
    }));
  }

  async getOwnCredentials(userId: string) {
    return this.prisma.credential.findMany({
      where: { subjectId: userId },
      include: { issuer: { select: { legalName: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateOwnProfile(userId: string, dto: UpdateProfileDto) {
    const profile = await this.prisma.userProfile.update({
      where: { userId },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.profileData !== undefined
          ? { profileData: dto.profileData as Prisma.InputJsonValue }
          : {}),
      },
    });
    return profile;
  }
}
