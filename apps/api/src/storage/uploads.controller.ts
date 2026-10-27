import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { StorageService, MAX_UPLOAD_BYTES } from "./storage.service";

@Controller({ path: "uploads", version: "1" })
export class UploadsController {
  constructor(private readonly storageService: StorageService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file was uploaded (expected multipart field "file").');
    return { data: await this.storageService.save(file.buffer, file.originalname) };
  }

  // Authenticated, not authorized — anyone logged in who knows a storage key can fetch it.
  // Storage keys are unguessable (UUID-prefixed), but this is not real per-document access
  // control; see docs/security.md "Known limitations".
  @Get(":storageKey")
  @UseGuards(JwtAuthGuard)
  async download(@Param("storageKey") storageKey: string, @Res() res: Response) {
    const { filePath, contentType, filename } = await this.storageService.read(storageKey);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `inline; filename="${filename.replace(/"/g, "")}"`);
    res.sendFile(filePath);
  }
}
