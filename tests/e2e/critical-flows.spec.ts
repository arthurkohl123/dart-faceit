import { expect, test } from '@playwright/test';

test.describe('RankedDarts critical flow smoke tests', () => {
  test('login exposes recovery controls', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('E-Mail')).toBeVisible();
    await expect(page.getByLabel('Passwort')).toBeVisible();
    await expect(page.getByText('Passwort vergessen?', { exact: true })).toBeVisible();
  });

  test('queue and Result Room remain protected and recover to login', async ({ page }) => {
    for (const path of ['/matchmaking', '/result?matchId=00000000-0000-0000-0000-000000000000']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/auth\/login/);
      await expect(page.locator('body')).not.toContainText(/Application error|Internal Server Error/i);
    }
  });

  test('tournament registration surface renders without a runtime error', async ({ page }) => {
    await page.goto('/tournaments', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/Application error|Internal Server Error/i);
    await expect(page.locator('body')).toContainText(/Turnier/i);

    const tournamentLink = page.locator('a[href^="/tournaments/"]').first();
    if (await tournamentLink.count()) {
      await tournamentLink.click();
      await expect(page).toHaveURL(/\/tournaments\/[^/]+/);
      await expect(page.locator('body')).not.toContainText(/Application error|Internal Server Error/i);
    }
  });

  test('result submission and current-match APIs reject unauthenticated calls safely', async ({ request }) => {
    const currentMatch = await request.get('/api/matches/current');
    expect(currentMatch.status()).toBe(401);

    const resultSubmission = await request.post('/api/matches/00000000-0000-0000-0000-000000000000/submit', {
      data: { myLegs: 4, opponentLegs: 2, myAverage: 60, opponentAverage: 55, myOneEighties: 0, opponentOneEighties: 0, bestOf: 7 },
    });
    expect(resultSubmission.status()).toBe(401);
  });
});
