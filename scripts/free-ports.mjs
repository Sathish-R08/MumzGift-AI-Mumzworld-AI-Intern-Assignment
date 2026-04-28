/**
 * Stops processes listening on dev ports 3000 (Vite) and 3001 (API) so
 * `npm run dev` can start. Use when you see EADDRINUSE.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ports = [3000, 3001];

if (process.platform === "win32") {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const pwsh = join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const exe = existsSync(pwsh) ? pwsh : "powershell.exe";
  const list = ports.join(",");
  const cmd = `& { Get-NetTCPConnection -LocalPort ${list} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }`;
  try {
    execSync(`"${exe}" -NoProfile -Command "${cmd.replace(/"/g, '\\"')}"`, {
      stdio: "inherit",
    });
  } catch {
    process.exit(1);
  }
  console.log("Freed 3000/3001 if they were in use. Run: npm run dev");
} else {
  for (const port of ports) {
    try {
      execSync(`sh -c 'kill -9 $(lsof -t -iTCP:${port} -sTCP:LISTEN) 2>/dev/null'`, {
        stdio: "ignore",
      });
    } catch {
      /* no listener */
    }
  }
  console.log("Freed 3000/3001 (if in use). Run: npm run dev");
}
