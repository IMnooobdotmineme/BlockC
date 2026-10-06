import "dotenv/config";
import { compare, hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("The demo seed is development-only.");
  const password = process.env.DEMO_ADMIN_PASSWORD;
  if (!password || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Set DEMO_ADMIN_PASSWORD in .env: 12+ characters and at most 72 UTF-8 bytes.");
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const schema = new URL(connectionString).searchParams.get("schema") ?? "public";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) });
  try {
    const email = "admin@demo.edu";
    const existing = await prisma.organization.findUnique({ where: { email } });
    const passwordChanged = !existing || !(await compare(password, existing.passwordHash));
    const passwordHash = passwordChanged ? await hash(password, 12) : existing!.passwordHash;
    await prisma.$transaction(async tx => {
      const organization = await tx.organization.upsert({
        where: { email },
        create: { email, name: "Demo University", passwordHash },
        update: { name: "Demo University", passwordHash },
      });
      if (passwordChanged) await tx.organizationSession.deleteMany({ where: { organizationId: organization.id } });
    });
    console.log("Demo University is ready. Login email: admin@demo.edu. Password was not printed.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error("Demo seed failed. Verify DATABASE_URL, DEMO_ADMIN_PASSWORD (12+ characters, maximum 72 UTF-8 bytes), and migrations. Production seeding is disabled.");
  process.exitCode = 1;
});
