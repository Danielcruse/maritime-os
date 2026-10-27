import { ArrayMaxSize, IsArray, IsString } from "class-validator";

export class SubmitVerificationDto {
  // Opaque storage keys returned by the documents upload flow — never raw
  // file contents or publicly reachable URLs.
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  documentKeys!: string[];
}
