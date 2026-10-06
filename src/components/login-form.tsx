"use client";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, { error: "" });
  return <form action={action} className="space-y-5">
    <label className="field-label">Email<input className="input" type="email" name="email" autoComplete="username" placeholder="you@university.edu" maxLength={254} required /></label>
    <label className="field-label">Password<input className="input" type="password" name="password" autoComplete="current-password" placeholder="Enter your password" required aria-describedby={state.error ? "login-error" : undefined} /></label>
    {state.error && <p id="login-error" role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{state.error}</p>}
    <button className="btn-primary w-full disabled:cursor-wait disabled:opacity-60" disabled={pending} type="submit">{pending ? "Signing in…" : "Login →"}</button>
    <p className="text-xs leading-5 text-slate-500">Sign in with your organization account. Your session expires after eight hours.</p>
  </form>;
}
