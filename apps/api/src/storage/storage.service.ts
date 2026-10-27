import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { join, resolve } from "path";

const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}__[A-Za-z0-9._-]{1,200}$/;

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

const ALLOWED_EXTENSIONS = new Set(Object.keys(CONTENT_TYPE_BY_EXT));
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-150);
  return base.length > 0 ? base : "file";
}

export interface SavedFile {
  storageKey: string;
  contentHash: string;
  size: number;
  contentType: string;
}

export interface StoredFile {
  filePath: string;
  contentType: string;
  filename: string;
}

/**
 * Local-disk evidence/document storage — this sandbox has no reachable
 * object storage (STORAGE_ENDPOINT/STORAGE_BUCKET in .env are unset; see
 * docs/architecture.md). Files really are written and read from disk, not
 * mocked, but with none of a real object store's durability, replication
 * or access-tiering. Swap this service for an S3-backed one before any
 * shared deployment — nothing upstream of it should need to change, since
 * callers only ever see {storageKey, contentHash}.
 */
@Injectable()
export class StorageService {
  private readonly rootDir = resolve(process.cwd(), process.env.LOCAL_UPLOAD_DIR ?? ".local-data/uploads");

  async save(buffer: Buffer, originalName: string): Promise<SavedFile> {
    if (buffer.length === 0) throw new BadRequestException("Uploaded file is empty.");
    if (buffer.length > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(`File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB upload limit.`);
    }

    const ext = originalName.includes(".") ? originalName.split(".").pop()!.toLowerCase() : "";
    const contentType = CONTENT_TYPE_BY_EXT[ext];
    if (!contentType) {
      throw new BadRequestException(
        `Unsupported file type${ext ? ` ".${ext}"` : ""}. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}.`,
      );
    }

    await mkdir(this.rootDir, { recursive: true });
    const storageKey = `${randomUUID()}__${sanitizeFilename(originalName)}`;
    await writeFile(join(this.rootDir, storageKey), buffer);

    return {
      storageKey,
      contentHash: createHash("sha256").update(buffer).digest("hex"),
      size: buffer.length,
      contentType,
    };
  }

  async read(storageKey: string): Promise<StoredFile> {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) throw new NotFoundException("File not found.");
    const filePath = join(this.rootDir, storageKey);
    if (!existsSync(filePath)) throw new NotFoundException("File not found.");

    const filename = storageKey.slice(storageKey.indexOf("__") + 2);
    const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
    return { filePath, contentType: CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream", filename };
  }
}
