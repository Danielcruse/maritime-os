import { IsOptional, IsString, Length, Matches } from "class-validator";

export class CreateOrganizationDto {
  @IsString()
  @Length(2, 200)
  legalName!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  registrationNumber?: string;

  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;
}
