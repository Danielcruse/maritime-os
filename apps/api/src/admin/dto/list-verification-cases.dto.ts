import { IsEnum, IsOptional } from "class-validator";
import { VerificationDecision } from "@prisma/client";

export class ListVerificationCasesDto {
  @IsOptional()
  @IsEnum(VerificationDecision)
  decision?: VerificationDecision;
}
