// Smoke: fast, read-only checks that the deployed stack is alive. Safe to run against any environment.
import { expect, test } from "@playwright/test";
import { API_URL, openProduct } from "./support";

test.describe("@smoke", () => {
  test("API health check reports the database up", async ({ request }) => {
    const res = await request.get(`${API_URL}/health`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", database: "up" });
    expect(res.headers()["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("home renders the header and the product grid", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("img", { name: "Logo" })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search products" })).toBeVisible();
    await expect(page.getByText(/^\$ \d+\.\d{2}$/).first()).toBeVisible();
  });

  test("header search finds a product", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox", { name: "Search products" }).fill("headphones");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\?q=headphones/);
    await expect(page.getByText("Aurora Wireless Headphones").first()).toBeVisible();
  });

  test("product page shows price, variants and reviews", async ({ page }) => {
    await openProduct(page, "Aurora Wireless Headphones");
    await expect(page.getByRole("heading", { name: "Variants" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reviews" })).toBeVisible();
    await expect(page.getByText("Amazing sound")).toBeVisible();
  });

  test("anonymous visitors are sent to login from protected areas", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole("button", { name: "Login" })).toBeVisible();
  });

  test("unknown routes show the error page", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(page.getByText("Error 404")).toBeVisible();
  });

  test("theme toggle switches to dark mode", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Toggle theme/ }).click();
    await page.getByRole("menuitem", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
