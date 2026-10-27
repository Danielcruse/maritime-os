import { IsString, Length } from "class-validator";

export class SubmitEvidenceDto {
  // Returned by the (not-yet-built) signed-upload flow — never a raw file body.
  @IsString()
  @Length(1, 500)
  storageKey!: string;

  @IsString()
  @Length(32, 128)
  contentHash!: string;
}
