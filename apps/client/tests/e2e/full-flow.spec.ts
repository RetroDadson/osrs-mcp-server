import { expect, test } from '@playwright/test';

function uniqueGroupName(): string {
  return `e2egroup${Date.now() % 1_000_000}`;
}

test('create a solo group, walk setup, log back in, manage members, and log out', async ({ page }) => {
  const groupName = uniqueGroupName();

  await page.goto('/create-group');
  await page.getByLabel('Group name').fill(groupName);
  // Default member count is 1 (solo ironman path) - no need to touch the select.
  await page.getByLabel('Name of member 1').fill('soloplayer');
  await page.getByText('Create group').click();

  await expect(page).toHaveURL(/setup-instructions/);
  await expect(page.getByText(groupName)).toBeVisible();

  const revealButton = page.getByText('Click to show');
  await revealButton.click();
  const tokenText = await page.locator('strong').last().textContent();
  expect(tokenText).toBeTruthy();

  await page.getByText('Go to group').click();
  await expect(page).toHaveURL(/\/group/);
  await expect(page.getByLabel('Name of member 1')).toHaveValue('soloplayer');

  // Log out, then log back in with the credentials from setup-instructions.
  await page.getByText('Logout').click();
  await expect(page).toHaveURL('/');

  await page.goto('/login');
  await page.getByLabel('Group name').fill(groupName);
  await page.getByLabel('Group token').fill(tokenText!);
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page).toHaveURL(/\/group/);
  await expect(page.getByLabel('Name of member 1')).toHaveValue('soloplayer');

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
  await expect(page.getByText('Login')).toBeVisible();
});
