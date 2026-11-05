import { type ChildProcess, spawn } from "node:child_process";

/** What's running, to stop with us: Ctrl+C at a prompt reaches only this process, not its children. */
const running = new Set<ChildProcess>();
process.on("exit", () => {
  for (const p of running) {
    try {
      process.kill(-p.pid!, "SIGTERM"); // its whole group: npx, Remotion, and Remotion's browser
    } catch {}
  }
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, () => process.exit(130));

export function run(cmd: string, argv: string[]) {
  return new Promise<void>((resolve, reject) => {
    // A group of its own, so it can be stopped whole; it has no use for the keyboard.
    const p = spawn(cmd, argv, { stdio: ["ignore", "inherit", "inherit"], detached: true });
    running.add(p);
    p.on("exit", (code) => {
      running.delete(p);
      code === 0 ? resolve() : reject(new Error(`${cmd} ${argv[0]} exited with ${code}`));
    });
  });
}
