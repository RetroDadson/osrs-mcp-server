import { expect, test } from '@playwright/test';

function uniqueLoginName(): string {
  return `e2elogin${Date.now() % 1_000_000}`;
}

test('create a solo login, walk setup, log back in, manage members, and log out', async ({ page }) => {
  const loginName = uniqueLoginName();

  await page.goto('/create-login');
  // Solo path: fill only your own name, leave "Add others" collapsed.
  await page.getByLabel('Your OSRS name').fill(loginName);
  await page.getByText('Create login').click();

  await expect(page).toHaveURL(/setup-instructions/);
  await expect(page.locator('main').getByText(loginName)).toBeVisible();

  const revealButton = page.getByText('Click to show');
  await revealButton.click();
  const tokenText = await page.locator('strong').last().textContent();
  expect(tokenText).toBeTruthy();

  await page.getByText('Continue').click();
  await expect(page).toHaveURL(/\/manage/);
  await expect(page.getByLabel('Name of member 1')).toHaveValue(loginName);

  // Log out, then log back in with the credentials from setup-instructions.
  await page.getByText('Logout').click();
  await expect(page).toHaveURL('/');

  await page.goto('/login');
  await page.getByLabel('Login name').fill(loginName);
  await page.getByLabel('Token').fill(tokenText!);
  await page.locator('form').getByRole('button', { name: 'Login' }).click();

  await expect(page).toHaveURL(/\/manage/);
  await expect(page.getByLabel('Name of member 1')).toHaveValue(loginName);

  // Add a second member.
  await page.getByLabel('Name of member 2').fill('secondplayer');
  await page.getByText('Add').click();
  await expect(page.getByLabel('Name of member 2')).toHaveValue('secondplayer');

  // Rename the first member.
  await page.getByLabel('Name of member 1').fill('renamedplayer');
  await page.getByText('Rename').first().click();
  await expect(page.getByLabel('Name of member 1')).toHaveValue('renamedplayer');

  // Remove the second member, confirming the dialog.
  await page.getByText('Remove').nth(1).click();
  await page.getByText('Yes').click();
  await expect(page.getByLabel('Name of member 2')).not.toHaveValue('secondplayer');

  await page.getByText('Logout').click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { level: 1, name: 'OSRS MCP' })).toBeVisible();
});
