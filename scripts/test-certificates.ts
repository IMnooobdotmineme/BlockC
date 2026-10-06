// The earlier mock-only HTTP assertions are superseded by the Step 8 real-chain suite.
import { spawn } from "node:child_process";
const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "test:integration"], {
  stdio: "inherit", windowsHide: true, shell: process.platform === "win32",
});
child.on("error", () => { console.error("Unable to start certificate integration tests."); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
