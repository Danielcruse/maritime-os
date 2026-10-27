import { IsNumberString, IsOptional, IsString, Length, Matches } from "class-validator";

export class CreateApplicationDto {
  @IsNumberString()
  quoteAmount!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  message?: string;
}
