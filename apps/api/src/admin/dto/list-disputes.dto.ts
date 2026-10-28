import { IsEnum, IsOptional } from "class-validator";
import { DisputeStatus } from "@prisma/client";

export class ListDisputesDto {
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;
}
