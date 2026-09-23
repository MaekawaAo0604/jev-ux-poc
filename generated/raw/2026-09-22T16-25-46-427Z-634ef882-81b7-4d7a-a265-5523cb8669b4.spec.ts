// Generated from a verified Action Trace. Preserve this raw file; translate into a separate POM file.
import { test, expect } from "@playwright/test";
import { goals } from "../../tests/goals.js";

test.use({ viewport: {"width":1280,"height":900} });

test("メール通知を停止したい", async ({ page, baseURL }) => {
  if (!baseURL) throw new Error("Raw replay requires a local baseURL");
  const replayOrigin = new URL(baseURL);
  if (!["http:", "https:"].includes(replayOrigin.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(replayOrigin.hostname) || replayOrigin.username || replayOrigin.password) throw new Error("Raw replay requires a local HTTP(S) baseURL without credentials");
  await page.context().route("**/*", route => new URL(route.request().url()).origin === replayOrigin.origin ? route.continue() : route.abort());
  await page.goto("/good/");
  // Recorded step 1
  await page.getByRole("link", { name: "通知設定", exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === "/good/" && url.search === "" && url.hash === "#notifications");
  // Recorded step 2
  await page.getByRole("button", { name: "メール通知を停止する", exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === "/good/" && url.search === "" && url.hash === "#notifications");
  await expect.poll(() => goals.notifications.check(page)).toBe(true);
});
