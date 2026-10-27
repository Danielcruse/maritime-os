/**
 * Starts a local, file-backed PostgreSQL cluster for development — no
 * Docker and no system install required. This exists because the machine
 * this project was first set up on has neither Docker nor a local Postgres
 * service, and the official PostgreSQL installer's download host returned
 * HTTP 403 to this environment's outbound IP when tried via winget.
 *
 * NOT used in production — see docker-compose.yml / a managed Postgres
 * instance for that. This is strictly a local-dev convenience, backed by
 * zonky's prebuilt binaries (via the `embedded-postgres` npm package).
 *
 * Usage: node scripts/local-db.mjs
 * Leave it running in its own terminal; Ctrl+C stops the cluster cleanly.
 */
import EmbeddedPostgres from "embedded-postgres";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.join(__dirname, "..", ".local-data", "postgres");

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "maritime",
  password: "maritime_dev_pw",
  port: 5432,
  persistent: true,
});

async function main() {
  const fs = await import("fs");
  const alreadyInitialised = fs.existsSync(path.join(databaseDir, "PG_VERSION"));

  if (!alreadyInitialised) {
    console.log(`Initialising Postgres cluster at ${databaseDir} ...`);
    await pg.initialise();
  }

  console.log("Starting Postgres...");
  await pg.start();
  console.log("Postgres is running on port 5432.");

  const client = pg.getPgClient();
  await client.connect();
  const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = 'maritime_os'");
  if (existing.rowCount === 0) {
    console.log("Creating database maritime_os...");
    await pg.createDatabase("maritime_os");
  }
  await client.end();

  console.log("READY: postgresql://maritime:maritime_dev_pw@localhost:5432/maritime_os");

  const shutdown = async () => {
    console.log("Stopping Postgres...");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
