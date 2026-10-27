import { createParamDecorator, ExecutionContext, BadRequestException } from "@nestjs/common";

/**
 * Pulls a required Idempotency-Key header. State-changing endpoints that must
 * never double-apply on retry (awards, points, evidence confirmation) take
 * this instead of trusting the client body.
 */
export const IdempotencyKey = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  const key = request.headers["idempotency-key"];
  if (!key || typeof key !== "string") {
    throw new BadRequestException("Idempotency-Key header is required for this operation.");
  }
  return key;
});
