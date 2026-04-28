/**
 * Runs backend and frontend in parallel without relying on `concurrently`
 * (avoids "spawn cmd.exe ENOENT" when ComSpec or PATH is broken in the IDE).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function getSpawnEnv() {
  const env = { ...process.env };
  if (process.platform === "win32") {
    const systemRoot = env.SystemRoot || "C:\\Windows";
    const cmd = join(systemRoot, "System32", "cmd.exe");
    if (existsSync(cmd)) {
      env.ComSpec = cmd;
    }
  }
  return env;
}

function start(label, args) {
  return spawn("npm", args, {
    cwd: root,
    stdio: "inherit",
    env: getSpawnEnv(),
    shell: true,
  });
}

const api = start("api", ["run", "dev", "-w", "backend"]);
const ui = start("ui", ["run", "dev", "-w", "frontend"]);

const stopBoth = (sig) => {
  try {
    api.kill(sig);
  } catch {
    /* ignore */
  }
  try {
    ui.kill(sig);
  } catch {
    /* ignore */
  }
  process.exit(0);
};

process.on("SIGINT", () => stopBoth("SIGINT"));
process.on("SIGTERM", () => stopBoth("SIGTERM"));

let otherStopped = false;
function onChildExit(name, other, code) {
  if (otherStopped) return;
  if (code !== 0 && code != null) {
    otherStopped = true;
    try {
      other.kill("SIGINT");
    } catch {
      /* ignore */
    }
    process.exit(typeof code === "number" ? code : 1);
  }
}

api.on("exit", (code) => onChildExit("api", ui, code));
ui.on("exit", (code) => onChildExit("ui", api, code));

api.on("error", (e) => {
  console.error("[dev] backend spawn error:", e.message);
  process.exit(1);
});
ui.on("error", (e) => {
  console.error("[dev] frontend spawn error:", e.message);
  process.exit(1);
});
