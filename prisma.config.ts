import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // Generation works without credentials. Migration commands require DATABASE_URL.
  datasource: { url: process.env.DATABASE_URL },
});
