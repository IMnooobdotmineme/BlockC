# Organization authentication (Step 4)

The organization login checks PostgreSQL credentials. Step 5 now stores issued
certificates and loads organization lists/details/counts from PostgreSQL; see
[certificate storage](certificates.md). Public verification remains mock-only.

## Demo account

Set `DEMO_ADMIN_PASSWORD` in the ignored root `.env` to a password with at least
12 characters and no more than 72 UTF-8 bytes (bcrypt's input limit). Do not
URL-encode this password: only the password inside `DATABASE_URL` needs URL encoding.
If no demo password was configured during setup, a random password was generated
directly in the local `.env`. It was not printed or added to source control.

```powershell
npm.cmd run db:generate
npm.cmd run db:seed
```

Open `/login` and use `admin@demo.edu` with the value of `DEMO_ADMIN_PASSWORD`.
The seed upserts Demo University by unique email. Re-running it does not create
duplicates. Changing the environment password and re-running the seed updates
its hash and invalidates existing demo sessions. The seed is development-only.

## Sessions and route protection

- Passwords are bcrypt hashes with cost 12 and an automatically generated salt.
  Neither plaintext passwords nor password hashes are sent to the browser.
- Login validates inputs on the server and returns the same error for unknown
  accounts and wrong passwords. An unknown account still performs a bcrypt check.
- A session uses a cryptographically random 32-byte token. Only its SHA-256 hash
  is stored in the `OrganizationSession` table, alongside the owner and expiry.
- The cookie is HttpOnly, SameSite=Lax, host-only, scoped to `/`, and expires
  after eight hours. It is Secure in production; local `npm run dev` uses HTTP.
  Production hosting must use HTTPS.
- Server Actions provide same-origin request checks. Login and Logout use POST
  forms. Logout removes the database session and clears the cookie.
- Both the organization layout and each protected page check the database session
  on the server. Expired, missing, revoked, and forged sessions redirect to `/login`.
  Checks are memoized only within a request. No password hash is passed to the UI.
- Public pages remain accessible without login. The navigation shows the actual
  organization name and provides a Logout button.
- A single-process limiter allows 10 login attempts per email in 15 minutes.
  Before deploying multiple instances, replace it with a shared persistent limiter.
- Expired sessions for an organization are cleaned up when it signs in again.
  No session signing secret is needed because sessions are validated in PostgreSQL.

## Validation

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

For integration checks, start the production build in a separate terminal:

```powershell
npm.cmd run start -- --port 3001
```

Then run:

```powershell
$env:AUTH_TEST_PRODUCTION = "1"
npx.cmd tsx scripts/test-auth.ts
```

The integration checks exercise real rendered login/logout forms,
redirects, cookie flags, wrong passwords, unknown accounts, tampered cookies,
expired sessions, and logout revocation. Temporary test sessions are removed.
They do not print credentials or create certificate records.
