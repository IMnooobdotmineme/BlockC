import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";

const cookieName = "organization_session";
const lifetimeSeconds = 8 * 60 * 60;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const validToken = (token: string | undefined): token is string => Boolean(token && /^[A-Za-z0-9_-]{43}$/.test(token));

export async function createSession(organizationId: string) {
  const cookieStore = await cookies();
  const oldToken = cookieStore.get(cookieName)?.value;
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + lifetimeSeconds * 1000);
  await prisma.$transaction(async tx => {
    if (validToken(oldToken)) await tx.organizationSession.deleteMany({ where: { tokenHash: tokenHash(oldToken) } });
    await tx.organizationSession.deleteMany({ where: { organizationId, expiresAt: { lte: new Date() } } });
    await tx.organizationSession.create({ data: { tokenHash: tokenHash(token), organizationId, expiresAt } });
  });
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: lifetimeSeconds,
    expires: expiresAt,
  });
}

export const getOrganization = cache(async () => {
  const token = (await cookies()).get(cookieName)?.value;
  if (!validToken(token)) return null;
  const session = await prisma.organizationSession.findUnique({
    where: { tokenHash: tokenHash(token) },
    select: { expiresAt: true, organization: { select: { id: true, name: true, email: true } } },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  return session.organization;
});

export async function requireOrganization() {
  const organization = await getOrganization();
  if (!organization) redirect("/login");
  return organization;
}

export async function deleteSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (validToken(token)) await prisma.organizationSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
  cookieStore.delete(cookieName);
}
