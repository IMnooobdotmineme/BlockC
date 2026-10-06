import { PublicShell, PageHeading } from "@/components/ui";
import { LoginForm } from "@/components/login-form";
export default function Login() { return <PublicShell><div className="mx-auto max-w-md py-10 sm:py-16"><PageHeading eyebrow="Organization portal" title="Organization Login" description="Access your workspace to manage digital certificates." /><div className="panel p-7 sm:p-8"><LoginForm /></div></div></PublicShell>; }
