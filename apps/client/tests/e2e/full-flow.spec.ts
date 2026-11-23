import { expect, test } from '@playwright/test';

function uniqueLoginName(): string {
  return `e2elogin${Date.now() % 1_000_000}`;
}

test('create a login, walk setup, log back in, rename, and log out', async ({ page }) => {
  const loginName = uniqueLoginName();

  await page.goto('/create-login');
  await page.getByLabel('Your OSRS name').fill(loginName);
  await page.getByText('Create login').click();

  await expect(page).toHaveURL(/setup-instructions/);
  await expect(page.locator('main').getByText(loginName)).toBeVisible();

  const revealButton = page.getByText('Click to show');
  await revealButton.click();
  const tokenText = await page.locator('strong.token-value').textContent();
  expect(tokenText).toBeTruthy();

  await page.locator('nav').getByText('Settings').click();
  await expect(page).toHaveURL(/\/manage/);
  await expect(page.getByLabel('Your OSRS name')).toHaveValue(loginName);

  // Log out, then log back in with just the token from setup-instructions.
  await page.getByText('Logout').click();
  await expect(page).toHaveURL('/');

  await page.goto('/login');
  await page.getByLabel('Token').fill(tokenText!);
  await page.locator('form').getByRole('button', { name: 'Login' }).click();

  await expect(page).toHaveURL(/\/manage/);
  await expect(page.getByLabel('Your OSRS name')).toHaveValue(loginName);

  // Rename the login.
  await page.getByLabel('Your OSRS name').fill('renamedplayer');
  await page.getByText('Rename').click();
  await expect(page.getByLabel('Your OSRS name')).toHaveValue('renamedplayer');

  await page.getByText('Logout').click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { level: 1, name: 'OSRS MCP' })).toBeVisible();
});
