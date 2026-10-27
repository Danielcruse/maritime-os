import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * MVP admin check: the user's id must appear in a configured allowlist.
 * Replace with a proper `admin_users` table + role assignment before
 * any production deployment — this exists only so the verification and
 * moderation endpoints have *some* enforced boundary during development.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.userId;
    const allowlist = (this.configService.get<string>("ADMIN_USER_IDS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!userId || !allowlist.includes(userId)) {
      throw new ForbiddenException("Administrator role required.");
    }
    return true;
  }
}
