# Database setup (Step 3)

Organization authentication and the demo-account seed are implemented in Step 4;
see [authentication setup](../docs/authentication.md). Step 5 adds
[certificate creation and storage](../docs/certificates.md). Only public
verification remains mock-only. No blockchain writes are added.

## Configure PostgreSQL

1. Start a local PostgreSQL server or provision a hosted PostgreSQL database.
2. Create an empty database named `blockchain_certificates` using pgAdmin or
   `createdb -U YOUR_USER blockchain_certificates`. Use a dedicated development
   database, not an existing database containing important data.
3. From the project root, run `Copy-Item .env.example .env` in PowerShell.
   Edit `.env` and replace `YOUR_USER` and `YOUR_PASSWORD` with your PostgreSQL
   credentials, and adjust the host, port, and database name if necessary.
   URL-encode special characters in credentials. `.env` is ignored by Git.

Only `DATABASE_URL` is required. Do not prefix it with `NEXT_PUBLIC_`.
On this Windows machine, the detected service is `postgresql-x64-13` and its
port is `5433`. Start it with `Start-Service -Name postgresql-x64-13` in an
Administrator PowerShell window if it is stopped. The local `.env` uses that
port; the generic `.env.example` uses PostgreSQL's default port.
Prisma CLI loads the root `.env` through `prisma.config.ts`; Next.js loads it
for server-side code automatically. Hosted providers may require additional
connection parameters such as `sslmode=require`.

## Generate and migrate

```powershell
npm.cmd run db:generate
npm.cmd run db:migrate -- --name init
```

The migration command connects to PostgreSQL, creates the initial migration in
`prisma/migrations`, and applies the models and enum. No rows are inserted.
Commit the resulting migration files. Client generation also runs automatically
on install and before builds. Generation does not require a running database.

For local development, Prisma Migrate also needs permission to create a shadow
database. Use a development role with that permission; restricted hosted roles
may need a separate shadow database configured in `prisma.config.ts`.

## Schema decisions

- Both models use generated string IDs; `certificateId` is a separate unique,
  human-readable identifier that future issuance code must provide.
- Organization emails are unique. `passwordHash` is only a schema field;
  no password storage or authentication flow is implemented.
- Certificate issue/expiration dates use PostgreSQL `DATE` columns.
- Status defaults to `VALID`. Dates do not automatically update stored status;
  lifecycle logic will be added in a later step.
- Blockchain/hash fields are nullable, without fake defaults or seed values.
- Each certificate belongs to an organization. Deleting an organization with
  certificates is restricted, and its foreign key is indexed.
- `organizationName` preserves the name recorded on the certificate.

The reusable server-only client is `src/lib/prisma.ts`. It validates the
connection setting when imported and reuses its pool during hot reloads.
The existing UI does not import it, so it continues working without `.env`.

## Checks

```powershell
npm.cmd run db:validate
npm.cmd run db:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```
