// Full E2E: real browser + real API + seeded test database. Tests run in order and share state.
import { expect, test } from "@playwright/test";
import { login, logout, openProduct, USERS } from "./support";

test.describe.configure({ mode: "serial" });

// 1×1 PNG used to exercise the real upload + Sharp pipeline.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("visitor registers, gets the account menu and logs out", async ({ page }) => {
  const email = `e2e-${Date.now()}@test.com`;
  await page.goto("/auth/register");
  await page.getByLabel("Full Name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("secret123");
  await page.getByLabel("Confirm Password").fill("secret123");
  await page.getByRole("button", { name: /Create Account/ }).click();

  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("menuitem", { name: "Profile" })).toBeVisible();
  await page.keyboard.press("Escape");
  await logout(page);
});

test("wrong credentials show an error and keep the user out", async ({ page }) => {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(USERS.customer);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByText("Something's going wrong.")).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("customer adds to cart, sees the badge and removes the item", async ({ page }) => {
  await login(page, USERS.customer);
  await openProduct(page, "Linen Throw Blanket");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to cart!")).toBeVisible();
  await expect(page.getByLabel("1 items in cart")).toBeVisible();

  await page.getByRole("button", { name: "Cart", exact: true }).click();
  await expect(page).toHaveURL(/\/cart/);
  await expect(page.getByText("Linen Throw Blanket").first()).toBeVisible();
  await page.getByTitle("Remove from cart").first().click();
  await expect(page.getByLabel("1 items in cart")).toBeHidden();
});

test("customer manages profile data and addresses", async ({ page }) => {
  await login(page, USERS.customer);
  await page.goto("/profile?tab=account");
  const name = page.getByLabel("Name", { exact: true });
  await name.fill("Jane Updated");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved!")).toBeVisible();

  await page.goto("/profile?tab=addresses");
  await page.getByRole("button", { name: "Add address" }).click();
  await page.getByLabel("Label *").fill("Office");
  await page.getByLabel("ZIP code *").fill("20040-002");
  await page.getByLabel("Street *").fill("Av. Rio Branco");
  await page.getByLabel("Number *").fill("1");
  await page.getByLabel("City *").fill("Rio de Janeiro");
  await page.getByLabel("State *").fill("RJ");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByText("Av. Rio Branco, 1 · Rio de Janeiro/RJ · 20040-002")).toBeVisible();
});

test("customer clears notifications and the header badge disappears", async ({ page }) => {
  await login(page, USERS.customer);
  await expect(page.getByLabel(/unread notifications/)).toBeVisible();
  await page.goto("/profile?tab=notifications");
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel(/unread notifications/)).toBeHidden();
});

test("buyer reviews a purchased product; it waits for moderation", async ({ page }) => {
  await login(page, USERS.customer);
  await openProduct(page, "Trail Runner Sneakers");
  await page.getByRole("radio", { name: "4 stars" }).click();
  await page.getByLabel("Review title").fill("Great grip on trails");
  await page.getByLabel("Review comment").fill("Light and comfortable.");
  await page.getByRole("button", { name: "Submit review" }).click();
  await expect(page.getByText("Thanks! Your review is awaiting moderation.")).toBeVisible();
  await expect(page.getByText("Great grip on trails")).toBeHidden();
});

test("non-buyers cannot review", async ({ page }) => {
  await login(page, USERS.john);
  await openProduct(page, "Linen Throw Blanket");
  await expect(page.getByText("Only customers who bought this product can review it.")).toBeVisible();
});

test("customer is blocked from the admin area", async ({ page }) => {
  await login(page, USERS.customer);
  await page.goto("/admin");
  await expect(page.getByText("403 — You don't have access to the admin area.")).toBeVisible();
});

test("admin approves the pending review and it goes live", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/admin/reviews");
  const card = page.locator(".global-card", { hasText: "Great grip on trails" });
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card).toBeHidden();

  await openProduct(page, "Trail Runner Sneakers");
  await expect(page.getByText("Great grip on trails")).toBeVisible();
});

test("admin sees the analytics dashboard", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  // KPI labels are the uppercase captions inside the cards (the nav also has a "Users" link).
  const kpiLabels = page.locator("span.uppercase");
  for (const kpi of ["Revenue", "Paid orders", "Avg. order value", "Checkout conversion", "Users"]) {
    await expect(kpiLabels.getByText(kpi, { exact: true })).toBeVisible();
  }
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Best sellers" })).toBeVisible();
});

test("admin creates a product with an image and customers can find it", async ({ page }) => {
  const title = `E2E Lamp ${Date.now()}`;
  await login(page, USERS.admin);
  await page.goto("/admin/products");
  await page.getByRole("button", { name: "New product" }).click();
  await page.getByLabel("Title *").fill(title);
  await page.getByLabel("Description").fill("Warm desk lamp created by the E2E suite");
  await page.getByLabel("Base price *").fill("59.90");
  await page.getByLabel("Category *").fill("home");
  await page.getByLabel("Initial stock *").fill("7");
  await page.getByLabel("First variant attributes *").fill("color=amber");
  await page.getByLabel("Main image *").setInputFiles({ name: "lamp.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("cell", { name: new RegExp(title) })).toBeVisible();

  await openProduct(page, title);
  await expect(page.getByText("$ 59.9")).toBeVisible();
});

test("only the superadmin can change roles, and it is audited", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/admin/users");
  await expect(page.getByText("Only a SUPERADMIN can change roles.")).toBeVisible();
  await logout(page);

  await login(page, USERS.superadmin);
  await page.goto("/admin/users");
  await page.getByLabel("Role of John Buyer").selectOption("ADMIN");
  await expect(page.getByLabel("Role of John Buyer")).toHaveValue("ADMIN");

  await page.goto("/admin/audit");
  await expect(page.getByText("USER_ROLE_CHANGE").first()).toBeVisible();
});

test("admin opens the logs from the dashboard and investigates failed logins", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/admin");
  await page.getByRole("link", { name: "View logs" }).click();
  await expect(page).toHaveURL(/\/admin\/logs/);
  await expect(page.getByRole("heading", { name: "Logs" })).toBeVisible();
  await expect(page.getByText(/\d+ entries/)).toBeVisible();

  await page.getByRole("button", { name: "Failed logins" }).click();
  await expect(page).toHaveURL(/event=auth\.login\.failed/);
  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toContainText("auth.login.failed");

  // LGPD: the details show the masked e-mail, never the real one.
  await firstRow.getByRole("button", { name: "Show details" }).click();
  const details = page.locator("pre").first();
  await expect(details).toContainText("c***@store.com");
  await expect(details).not.toContainText("customer@store.com");

  // Following a request id narrows the view to that single request.
  await firstRow.locator("td").nth(5).getByRole("button").click();
  await expect(page).toHaveURL(/requestId=/);
  await page.getByRole("button", { name: /Clear filters/ }).click();
  await expect(page).not.toHaveURL(/event=|requestId=/);
});

test("admins cannot pick the access log; superadmin sees the legal notice", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/admin/logs");
  await expect(page.getByLabel("Source").locator("option", { hasText: "Access (full IP)" })).toHaveCount(0);
  await logout(page);

  await login(page, USERS.superadmin);
  await page.goto("/admin/logs");
  await page.getByLabel("Source").selectOption("access");
  await expect(page.getByText(/Marco Civil, art\. 15/)).toBeVisible();
  await expect(page.locator("tbody tr").first()).toContainText("access");
});
