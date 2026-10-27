import { IsISO8601, IsObject, IsOptional, IsString, Length, Matches } from "class-validator";

export class CreateListingDto {
  @IsString()
  @Length(3, 200)
  title!: string;

  @IsObject()
  origin!: Record<string, unknown>;

  @IsObject()
  destination!: Record<string, unknown>;

  @IsString()
  @Length(1, 2000)
  cargoSummary!: string;

  @IsOptional()
  @IsObject()
  capacity?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
