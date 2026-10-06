import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";

const root = process.cwd();
const git = args => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
const findings = new Map();
function flag(file, type) { const types = findings.get(file) ?? new Set(); types.add(type); findings.set(file, types); }
try {
  const tracked = git(["ls-files", "--cached", "-z", "--", "."]).split("\0").filter(Boolean);
  const candidates = [...new Set(git(["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "."]).split("\0").filter(Boolean))];
  const repoRoot = git(["rev-parse", "--show-toplevel"]).trim();
  const projectRepository = path.resolve(repoRoot).toLowerCase() === root.toLowerCase();
  let envIgnored = false;
  try { git(["check-ignore", "--quiet", "--", ".env"]); envIgnored = true; } catch { flag(".env", "ENV_FILE_NOT_IGNORED"); }
  const privateConfig = { ...(existsSync(".env") ? parse(readFileSync(".env")) : {}), ...process.env };
  const secrets = [];
  for (const type of ["BLOCKCHAIN_PRIVATE_KEY", "SMTP_PASSWORD", "DEMO_ADMIN_PASSWORD", "DATABASE_URL", "SEPOLIA_RPC_URL", "SMTP_USER"]) {
    const value = privateConfig[type];
    if (value && value.length >= 8) {
      secrets.push([type, value]);
      if (type === "BLOCKCHAIN_PRIVATE_KEY") secrets.push([type, value.replace(/^0x/, "")]);
    }
  }
  try {
    const password = new URL(privateConfig.DATABASE_URL).password;
    if (password.length >= 6) secrets.push(["DATABASE_PASSWORD", password], ["DATABASE_PASSWORD", decodeURIComponent(password)]);
  } catch { /* Missing/invalid URL: no credential value is printed. */ }
  function inspect(file, text) {
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) flag(file, "PRIVATE_KEY_PEM");
    if (/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/.test(text)) flag(file, "GITHUB_TOKEN");
    for (const [type, value] of secrets) if (text.includes(value)) flag(file, type);
    for (const match of text.matchAll(/(?:BLOCKCHAIN_PRIVATE_KEY|SMTP_PASSWORD|DEMO_ADMIN_PASSWORD)\s*[=:]\s*["']([^"'\r\n]+)["']/g)) {
      if (!/^(?:YOUR_|REPLACE_|<|test-|intentionally-)/i.test(match[1])) flag(file, "LITERAL_CREDENTIAL_ASSIGNMENT");
    }
    for (const match of text.matchAll(/(?:postgres(?:ql)?|mysql):\/\/[^\s/:"']+:[^\s@"']+@/g)) {
      if (!/YOUR_|REPLACE_|<|example/i.test(match[0])) flag(file, "DATABASE_URL_WITH_PASSWORD");
    }
    if (/\b(?:privateKey|private_key)\s*[=:]\s*["'](?:0x)?[0-9a-fA-F]{64}["']/.test(text)) flag(file, "PRIVATE_KEY_LITERAL");
  }
  for (const file of candidates) {
    const absolute = path.resolve(root, file);
    if (!absolute.startsWith(root + path.sep)) { flag(file, "PATH_OUTSIDE_PROJECT"); continue; }
    if (/^\.env(?:\.|$)/.test(path.basename(file)) && path.basename(file) !== ".env.example") flag(file, "ENV_FILE_IN_SUBMISSION");
    if (/\.(?:pem|p12|pfx|key)$/i.test(file)) flag(file, "KEY_FILE_IN_SUBMISSION");
    if (!existsSync(absolute)) continue;
    const bytes = readFileSync(absolute);
    if (!bytes.includes(0)) inspect(file, bytes.toString("utf8"));
  }
  let projectCommits = 0;
  try {
    git(["rev-parse", "--verify", "HEAD"]);
    projectCommits = git(["log", "--format=%H", "--", "."]).trim().split("\n").filter(Boolean).length;
    const history = git(["log", "--format=", "--patch", "--", "."]);
    for (const section of history.split(/^diff --git /m).slice(1)) {
      const file = section.split("\n", 1)[0].split(" b/").at(-1) ?? "project-history";
      inspect(`${file} (history)`, section);
      if (/\/\.env(?:\.|$)/.test(file) && !file.endsWith(".env.example")) flag(`${file} (history)`, "ENV_FILE_IN_HISTORY");
    }
  } catch {
    // An unborn branch has no history. Other history failures must not be called a clean scan.
    try { git(["rev-parse", "--verify", "HEAD"]); flag("project-history", "HISTORY_SCAN_INCOMPLETE"); } catch { /* No commits exist. */ }
  }
  const report = { trackedFiles: tracked.length, submissionCandidates: candidates.length, projectRepository, projectCommits,
    envIgnored, findings: [...findings].map(([file, types]) => ({ file, types: [...types] })),
    note: "Heuristic and configured-secret scan; manual staged-file and screenshot review is still required before publication." };
  mkdirSync("test-artifacts", { recursive: true });
  writeFileSync("test-artifacts/security-scan.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2)); // Counts, file names and variable types only; never secret values.
  if (findings.size) process.exitCode = 1;
} catch {
  console.error("Secret scan could not complete. Check Git access from the project root. No secret values were printed.");
  process.exitCode = 1;
}
