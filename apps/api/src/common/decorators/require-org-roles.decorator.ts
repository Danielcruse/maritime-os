import { SetMetadata } from "@nestjs/common";
import { MembershipRole } from "@prisma/client";
import { REQUIRE_ORG_ROLES_KEY } from "../guards/org-membership.guard";

export const RequireOrgRoles = (...roles: MembershipRole[]) =>
  SetMetadata(REQUIRE_ORG_ROLES_KEY, roles);
