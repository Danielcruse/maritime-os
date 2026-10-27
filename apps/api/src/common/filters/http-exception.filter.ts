import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "crypto";

interface ErrorBody {
  code: string;
  message: string;
  requestId: string;
}

/**
 * Normalizes every error response to { error: { code, message, requestId } }.
 * Never forwards stack traces, DB details or internal notes to clients.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("HttpExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const requestId = randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_ERROR";
    let message = "An unexpected error occurred.";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
      } else if (typeof body === "object" && body !== null) {
        const b = body as Record<string, unknown>;
        message = Array.isArray(b.message) ? b.message.join("; ") : (b.message as string) ?? message;
        code = (b.code as string) ?? this.codeFromStatus(status);
      }
      if (code === "INTERNAL_ERROR") code = this.codeFromStatus(status);
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : exception, requestId);
    }

    const errorBody: ErrorBody = { code, message, requestId };
    response.status(status).json({ error: errorBody });
  }

  private codeFromStatus(status: number): string {
    switch (status) {
      case 400:
        return "BAD_REQUEST";
      case 401:
        return "UNAUTHORIZED";
      case 403:
        return "FORBIDDEN";
      case 404:
        return "NOT_FOUND";
      case 409:
        return "CONFLICT";
      case 422:
        return "UNPROCESSABLE";
      case 429:
        return "RATE_LIMITED";
      default:
        return "INTERNAL_ERROR";
    }
  }
}
