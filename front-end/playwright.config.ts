import { defineConfig, devices } from "@playwright/test";

// By default Playwright boots an isolated stack: API on :3100 over the seeded "-test" database + Vite on :5174.
// Point E2E_BASE_URL / E2E_API_URL at a running environment to smoke-test it instead (no servers are started).
const external = !!process.env.E2E_BASE_URL;
export const WEB_URL = process.env.E2E_BASE_URL ?? "http://localhost:5174";
export const API_URL = process.env.E2E_API_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // flows share one seeded database
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "smoke", testMatch: /smoke\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "e2e", testMatch: /flows\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: external
    ? undefined
    : [
        {
          command: "npx tsx tests/support/e2e-server.ts",
          cwd: "../back-end",
          url: `${API_URL}/health`,
          reuseExistingServer: false,
          timeout: 240_000,
          stdout: "ignore",
        },
        {
          command: "npx vite --port 5174 --strictPort",
          url: WEB_URL,
          reuseExistingServer: false,
          timeout: 120_000,
          env: { VITE_API_URL: API_URL, VITE_STRIPE_PUBLISHABLE_KEY: "" },
        },
      ],
});
