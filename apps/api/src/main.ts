import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

// Prisma maps `BigInt` columns (e.g. ChainAnchor.blockNumber) to native
// BigInt, which JSON.stringify refuses to serialize by default. Every
// blockNumber comfortably fits in a JS number, but returning it as a string
// is the safe, lossless choice for any chain this ever points at.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.setGlobalPrefix("api");

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";
  app.enableCors({ origin: corsOrigin, credentials: true });

  const config = new DocumentBuilder()
    .setTitle("Maritime OS API")
    .setDescription(
      "Marketplace, identity, credentials, trust and audit API for Maritime OS",
    )
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  const port = process.env.API_PORT ? Number(process.env.API_PORT) : 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Maritime OS API listening on :${port} (docs at /api/docs)`);
}

bootstrap();
