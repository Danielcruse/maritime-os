import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsISO8601, IsOptional, IsString, IsUUID, Length, ValidateNested } from "class-validator";

export class CredentialEvidenceFileDto {
  @IsString()
  @Length(1, 500)
  storageKey!: string;

  @IsString()
  @Length(32, 128)
  contentHash!: string;
}

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
  @ValidateNested({ each: true })
  @Type(() => CredentialEvidenceFileDto)
  evidence?: CredentialEvidenceFileDto[];
}
