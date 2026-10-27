import { IsObject, IsOptional, IsString, Length } from "class-validator";

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  displayName?: string;

  // Deliberately permissive bag for professional info (certifications claimed,
  // bio, etc.) — NEVER used as a substitute for a verified Credential record.
  @IsOptional()
  @IsObject()
  profileData?: Record<string, unknown>;
}
