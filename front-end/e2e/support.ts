import { expect, type Page } from "@playwright/test";
export { API_URL, WEB_URL } from "../playwright.config";

// Seeded accounts (back-end/prisma/seed.ts) — test-only credentials on the isolated test database.
export const PASSWORD = "Password123!";
export const USERS = {
  superadmin: "superadmin@store.com",
  admin: "admin@store.com",
  customer: "customer@store.com",
  john: "john@store.com",
} as const;

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/auth/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  // Wait for the real API answer: a slow machine gets time, and a wrong status (e.g. 429) fails with a clear message.
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/auth/login") && r.request().method() === "POST", { timeout: 30_000 }),
    page.getByRole("button", { name: "Login" }).click(),
  ]);
  expect(response.status(), `login as ${email} (429 = rate limited)`).toBe(202);
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible({ timeout: 15_000 });
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
}

export async function openProduct(page: Page, title: string) {
  await page.goto(`/?q=${encodeURIComponent(title)}`);
  await page.getByText(title, { exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}
