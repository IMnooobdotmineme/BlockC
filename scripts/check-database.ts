import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString.includes("YOUR_PASSWORD")) {
    throw new Error("Configure DATABASE_URL in the local .env before running this check.");
  }
  const schema = new URL(connectionString).searchParams.get("schema") ?? "public";
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 10_000 }, { schema }),
  });

  try {
    const connection = await prisma.$queryRaw<{ database: string; user: string }[]>`
      SELECT current_database() AS database, current_user AS user
    `;
    console.log(`Prisma connected to ${connection[0].database} as ${connection[0].user}.`);
    const objects = await prisma.$queryRaw<{ organization: string | null; certificate: string | null; status: string | null }[]>`
      SELECT to_regclass('public."Organization"')::text AS organization,
             to_regclass('public."Certificate"')::text AS certificate,
             to_regtype('public."CertificateStatus"')::text AS status
    `;
    if (!objects[0].organization || !objects[0].certificate || !objects[0].status) {
      throw new Error("Required tables or enum are missing. Run the initial migration.");
    }
    const values = await prisma.$queryRaw<{ value: string }[]>`
      SELECT e.enumlabel AS value FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = 'CertificateStatus' AND n.nspname = 'public'
      ORDER BY e.enumsortorder
    `;
    if (values.map(row => row.value).join(",") !== "VALID,EXPIRED,REVOKED") {
      throw new Error("CertificateStatus enum values do not match the schema.");
    }
    const organizations = await prisma.organization.count();
    const certificates = await prisma.certificate.count();
    console.log("Verified Organization, Certificate, and CertificateStatus (VALID, EXPIRED, REVOKED).");
    console.log(`Read-only model queries passed: ${organizations} organizations, ${certificates} certificates.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  // Avoid printing driver errors that could contain connection credentials.
  console.error("Database check failed. Check local credentials, PostgreSQL service, and migration status.");
  process.exitCode = 1;
});
