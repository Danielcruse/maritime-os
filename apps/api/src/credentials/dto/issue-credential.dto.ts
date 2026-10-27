import { ArrayMaxSize, IsArray, IsISO8601, IsOptional, IsString, IsUUID, Length } from "class-validator";

export class IssueCredentialDto {
  @IsUUID()
  subjectUserId!: string;

  @IsString()
  @Length(2, 80)
  credentialType!: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  evidenceStorageKeys?: string[];
}
