import { IsEnum, IsOptional, IsString, Length } from "class-validator";

export enum DisputeResolutionAction {
  resolved_for_opener = "resolved_for_opener",
  resolved_for_counterparty = "resolved_for_counterparty",
  dismissed = "dismissed",
}

export class ResolveDisputeDto {
  @IsEnum(DisputeResolutionAction)
  status!: DisputeResolutionAction;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  resolutionCode?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  resolutionNotes?: string;
}
