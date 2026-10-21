import { defineConfig } from "vitest/config";
import path from "path";

// Front-end unit tests (pure logic). UI flows are covered by Playwright in e2e/.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
