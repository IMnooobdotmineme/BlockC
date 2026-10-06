import "dotenv/config";
import pg from "pg";

let client;
try {
  const url = new URL(process.env.DATABASE_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/blockchain_certificates") {
    throw new Error("LOCAL_TARGET_REQUIRED");
  }
  url.pathname = "/postgres";
  client = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 10000 });
  await client.connect();
  console.log("Local PostgreSQL credentials accepted.");
  const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", ["blockchain_certificates"]);
  if (result.rowCount) {
    console.log("Development database already exists; preserved existing data.");
  } else {
    await client.query('CREATE DATABASE "blockchain_certificates"');
    console.log("Created development database blockchain_certificates.");
  }
} catch (error) {
  console.error("Local database setup failed. Error code:", error.code ?? "INVALID_LOCAL_CONFIGURATION");
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}
