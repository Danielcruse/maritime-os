import { IsString, Length } from "class-validator";

export class OpenDisputeDto {
  @IsString()
  @Length(10, 2000)
  reason!: string;
}
