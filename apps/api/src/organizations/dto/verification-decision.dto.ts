import { IsEnum, IsOptional, IsString, Length } from "class-validator";

export enum VerificationDecisionAction {
  approved = "approved",
  rejected = "rejected",
  more_info_requested = "more_info_requested",
}

export class VerificationDecisionDto {
  @IsEnum(VerificationDecisionAction)
  decision!: VerificationDecisionAction;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  reasonCode?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;
}
