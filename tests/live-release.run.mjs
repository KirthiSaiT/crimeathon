// Runs the live release test (it writes to the real database, so it is opt-in).
import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["vitest", "run", "tests/live-release.test.ts"], { stdio: "inherit", shell: true, env: { ...process.env, LIVE_TESTS: "1" } });
process.exit(r.status ?? 1);
