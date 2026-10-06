import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { compare } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const base = new URL(process.env.AUTH_TEST_URL ?? "http://localhost:3001");
assert(["localhost", "127.0.0.1"].includes(base.hostname), "Auth tests must use a local server.");
const password = process.env.DEMO_ADMIN_PASSWORD;
assert(password, "Set DEMO_ADMIN_PASSWORD before testing.");
const connectionString = process.env.DATABASE_URL!;
const schema = new URL(connectionString).searchParams.get("schema") ?? "public";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) });
const tokens: string[] = [];
const protectedPaths = ["/dashboard", "/issue-certificate", "/certificates"];

function decode(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function formFrom(html: string, match: (form: string) => boolean) {
  const form = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(m => m[0]).find(match);
  assert(form, "Expected rendered server-action form.");
  const data = new FormData();
  for (const input of form.matchAll(/<input\b[^>]*>/g)) {
    const name = input[0].match(/\bname="([^"]*)"/)?.[1];
    const value = input[0].match(/\bvalue="([^"]*)"/)?.[1] ?? "";
    if (name?.startsWith("$ACTION")) data.append(decode(name), decode(value));
  }
  assert([...data.keys()].some(key => key.startsWith("$ACTION")), "Missing server-action metadata.");
  return data;
}
async function get(path: string, cookie?: string) {
  return fetch(new URL(path, base), { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
}
async function submit(path: string, data: FormData, cookie?: string) {
  return fetch(new URL(path, base), { method: "POST", body: data, redirect: "manual", headers: { Origin: base.origin, ...(cookie ? { Cookie: cookie } : {}) } });
}
async function expectProtected(cookie?: string) {
  for (const path of protectedPaths) {
    const response = await get(path, cookie);
    assert.equal(response.status, 307, `${path} must redirect without a valid session.`);
    assert.equal(new URL(response.headers.get("location")!, base).pathname, "/login");
  }
}
async function signIn() {
  const login = await get("/login");
  const data = formFrom(await login.text(), form => form.includes('name="email"'));
  data.set("email", "admin@demo.edu");
  data.set("password", password!);
  const response = await submit("/login", data);
  assert.equal(response.status, 303, "Correct credentials must redirect.");
  assert.equal(new URL(response.headers.get("location")!, base).pathname, "/dashboard");
  const setCookie = response.headers.getSetCookie().find(value => value.startsWith("organization_session="));
  assert(setCookie, "Login must issue a session cookie.");
  assert(/httponly/i.test(setCookie));
  assert(/samesite=lax/i.test(setCookie));
  assert(/path=\//i.test(setCookie));
  if (process.env.AUTH_TEST_PRODUCTION === "1") assert(/;\s*secure/i.test(setCookie));
  const cookie = setCookie.split(";")[0];
  tokens.push(cookie.split("=")[1]);
  return cookie;
}

async function main() {
  const organizations = await prisma.organization.findMany({ where: { email: "admin@demo.edu" } });
  assert.equal(organizations.length, 1, "Seed must create exactly one demo organization.");
  assert.equal(organizations[0].name, "Demo University");
  assert.notEqual(organizations[0].passwordHash, password);
  assert(await compare(password!, organizations[0].passwordHash), "Seed must store a valid bcrypt password hash.");
  await expectProtected();
  await expectProtected("organization_session=" + "x".repeat(43));
  for (const path of ["/", "/login", "/verify", "/verify/CERT-2026-001"]) assert.equal((await get(path)).status, 200);
  console.log("PASS: unique seeded account, bcrypt hash, public pages, unauthenticated and forged-cookie redirects.");

  for (const email of ["admin@demo.edu", "unknown@example.com"]) {
    const data = formFrom(await (await get("/login")).text(), form => form.includes('name="email"'));
    data.set("email", email);
    data.set("password", "intentionally-incorrect-test-password");
    const response = await submit("/login", data);
    assert.equal(response.status, 200);
    assert((await response.text()).includes("Invalid email or password."));
    assert(!response.headers.getSetCookie().some(value => value.startsWith("organization_session=")));
  }
  let cookie = await signIn();
  for (const path of protectedPaths) {
    const response = await get(path, cookie);
    assert.equal(response.status, 200);
    assert((await response.text()).includes("Demo University"));
  }
  const hash = createHash("sha256").update(tokens.at(-1)!).digest("hex");
  assert(await prisma.organizationSession.findUnique({ where: { tokenHash: hash } }));
  await prisma.organizationSession.update({ where: { tokenHash: hash }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await expectProtected(cookie);
  console.log("PASS: wrong-password and unknown-account errors, valid login, cookie flags, protected access, hashed session storage, expired-session rejection.");

  cookie = await signIn();
  const logoutData = formFrom(await (await get("/dashboard", cookie)).text(), form => form.includes("Logout"));
  const logout = await submit("/dashboard", logoutData, cookie);
  assert.equal(logout.status, 303);
  assert.equal(new URL(logout.headers.get("location")!, base).pathname, "/login");
  assert(logout.headers.getSetCookie().some(value => value.startsWith("organization_session=") && (/max-age=0/i.test(value) || /expires=Thu, 01 Jan 1970/i.test(value))));
  await expectProtected(cookie);
  assert.equal(await prisma.organizationSession.findUnique({ where: { tokenHash: createHash("sha256").update(tokens.at(-1)!).digest("hex") } }), null);
  console.log("PASS: Logout deletes the cookie, revokes the database session, and rejects replay of the old cookie.");
}

main().catch(() => {
  console.error("Authentication test failed. No passwords, cookies, or response bodies were printed.");
  process.exitCode = 1;
}).finally(async () => {
  await prisma.organizationSession.deleteMany({ where: { tokenHash: { in: tokens.map(token => createHash("sha256").update(token).digest("hex")) } } });
  await prisma.$disconnect();
});
