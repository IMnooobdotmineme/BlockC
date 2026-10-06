"use server";

import { randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, deleteSession } from "@/lib/session";
import { allowLoginAttempt, resetLoginAttempts } from "@/lib/login-throttle";

type LoginState = { error: string };
let dummyHash: Promise<string> | undefined;

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const emailValue = formData.get("email");
  const password = formData.get("password");
  const invalid = { error: "Invalid email or password." };
  if (typeof emailValue !== "string" || typeof password !== "string") return invalid;
  const email = emailValue.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || Buffer.byteLength(password, "utf8") > 72) return invalid;
  if (!allowLoginAttempt(email)) return { error: "Too many attempts. Please try again in 15 minutes." };
  try {
    const organization = await prisma.organization.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
    // Perform a password hash comparison for unknown accounts too.
    dummyHash ??= hash(randomBytes(32).toString("base64url"), 12);
    const accepted = await compare(password, organization?.passwordHash ?? await dummyHash);
    if (!organization || !accepted) return invalid;
    await createSession(organization.id);
    resetLoginAttempts(email);
  } catch {
    return { error: "Sign-in is temporarily unavailable. Please try again." };
  }
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
