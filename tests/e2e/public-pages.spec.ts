import { expect, test } from '@playwright/test';

const publicPages = [
  { path: '/', marker: /RankedDarts/i },
  { path: '/leaderboard', marker: /Leaderboard/i },
  { path: '/tournaments', marker: /Turnier/i },
  { path: '/premium', marker: /Premium/i },
  { path: '/impressum', marker: /Impressum/i },
];

for (const entry of publicPages) {
  test(`${entry.path} renders without a runtime error`, async ({ page }) => {
    const response = await page.goto(entry.path, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(400);
    const body = page.locator('body');
    await expect(body).not.toContainText(/Application error|Internal Server Error/i);

    if (await body.getByText(/Wartungsarbeiten|Geplante Wartung/i).count()) {
      await expect(body).toContainText(/RankedDarts/i);
      await expect(body).toContainText(/Wartung/i);
    } else {
      await expect(body).toContainText(entry.marker);
    }
  });
}

test('the public rank ladder contains all ten levels', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  test.skip(await page.getByText(/Wartungsarbeiten|Geplante Wartung/i).count() > 0, 'Public maintenance mode is active');
  await expect(page.getByText('Immortal', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Grandmaster', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/2000\+/).first()).toBeVisible();
});

test('public pages do not overflow the mobile viewport', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile layout check');

  for (const entry of publicPages) {
    await page.goto(entry.path, { waitUntil: 'domcontentloaded' });
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
});
