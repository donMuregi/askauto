import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Auth routes accessibility and redirects", () => {
  test("anonymous visitor to /apply is redirected to /sign-in?next=/apply", async ({ page }) => {
    await page.goto("/apply");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fapply/);
  });

  for (const path of ["/", "/fnpl", "/sign-up", "/sign-in", "/forgot-password"]) {
    test(`no serious accessibility violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(serious).toEqual([]);
    });
  }
});
