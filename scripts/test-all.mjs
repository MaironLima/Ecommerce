// Runs every test suite in a logical order: cheapest and most isolated first, so failures show up as early as possible.
//   npm run test:all                     everything
//   npm run test:all -- --from=smoke     resume from a step (after fixing a late failure)
import { spawnSync } from "child_process";

const STEPS = [
  { id: "types", title: "Type-check (back-end + front-end)", script: "test:types", why: "catches broken code before running anything" },
  { id: "unit-back", title: "Unit tests — back-end", script: "test:unit:back", why: "business rules in isolation, no database" },
  { id: "unit-front", title: "Unit tests — front-end", script: "test:unit:front", why: "UI logic in isolation" },
  { id: "integration", title: "Integration tests — API + PostgreSQL", script: "test:integration", why: "modules working together on a real database" },
  { id: "smoke", title: "E2E smoke — is the stack alive?", script: "test:smoke", why: "fast browser checks before the long journeys" },
  { id: "e2e", title: "E2E — full user journeys", script: "test:e2e", why: "real browser flows for customer and admin" },
  { id: "load", title: "Load (bomb) — throughput, brute force, overselling", script: "test:load", why: "behaviour under stress, last because it is the heaviest" },
];

const fromArg = process.argv.find((a) => a.startsWith("--from="))?.split("=")[1];
const start = fromArg ? STEPS.findIndex((s) => s.id === fromArg) : 0;
if (start < 0) {
  console.error(`Unknown step "${fromArg}". Use one of: ${STEPS.map((s) => s.id).join(", ")}`);
  process.exit(1);
}

const results = [];
for (const [i, step] of STEPS.entries()) {
  if (i < start) {
    results.push({ step: `${i + 1}. ${step.id}`, result: "skipped", time: "" });
    continue;
  }
  console.log(`\n\x1b[35m━━ [${i + 1}/${STEPS.length}] ${step.title}\x1b[0m  \x1b[2m(${step.why})\x1b[0m\n`);
  const t0 = Date.now();
  const { status } = spawnSync("npm", ["run", step.script], { stdio: "inherit", shell: true });
  const time = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  results.push({ step: `${i + 1}. ${step.id}`, result: status === 0 ? "passed" : "FAILED", time });

  if (status !== 0) {
    for (const rest of STEPS.slice(i + 1)) results.push({ step: `${STEPS.indexOf(rest) + 1}. ${rest.id}`, result: "not run", time: "" });
    console.table(results);
    console.error(`\n\x1b[31m✖ "${step.id}" failed. Fix it, then resume with: npm run test:all -- --from=${step.id}\x1b[0m`);
    process.exit(status ?? 1);
  }
}

console.table(results);
console.log("\n\x1b[32m✔ All test suites passed.\x1b[0m");
