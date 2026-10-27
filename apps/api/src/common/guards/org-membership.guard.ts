import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../prisma/prisma.service";
import { MembershipRole } from "@prisma/client";

export const REQUIRE_ORG_ROLES_KEY = "require_org_roles";

/**
 * Enforces that the authenticated user is an active member of the
 * organization named by `:organizationId` in the route, in one of the
 * allowed roles. Every endpoint that acts "on behalf of an organization"
 * (publish listing, award, verification submission) must use this —
 * membership can never be inferred from the request body alone.
 */
@Injectable()
export class OrgMembershipGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.userId;
    const organizationId: string | undefined =
      request.params?.organizationId ?? request.body?.organizationId;

    if (!userId || !organizationId) {
      throw new ForbiddenException("Organization context is required.");
    }

    const allowedRoles =
      this.reflector.get<MembershipRole[]>(REQUIRE_ORG_ROLES_KEY, context.getHandler()) ??
      (["owner", "admin", "member"] as MembershipRole[]);

    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });

    if (!membership || membership.status !== "active" || !allowedRoles.includes(membership.role)) {
      throw new ForbiddenException("You are not an authorized member of this organization.");
    }

    request.membership = membership;
    return true;
  }
}
