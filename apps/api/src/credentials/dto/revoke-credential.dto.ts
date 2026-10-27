import { IsString, Length } from "class-validator";

export class RevokeCredentialDto {
  @IsString()
  @Length(3, 200)
  reason!: string;
}
