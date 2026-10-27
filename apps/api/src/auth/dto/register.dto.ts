import { IsEmail, IsString, Length, Matches } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(12, 128, { message: "Password must be at least 12 characters." })
  password!: string;

  @IsString()
  @Length(2, 120)
  displayName!: string;

  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: "countryCode must be a 2-letter ISO code, e.g. NG." })
  countryCode!: string;
}
