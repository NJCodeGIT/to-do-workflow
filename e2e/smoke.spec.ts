import { expect, test } from '@playwright/test';
import { addTask, expectNoSeriousA11yViolations, PASSWORD, register, uniqueEmail } from './helpers';

test('register, log out, log in again', async ({ page }) => {
  const email = uniqueEmail();
  await register(page, email);
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Your tasks' })).toBeVisible();
});

test('visiting the task list without a session redirects to login', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
});

test('add a task and edit its title', async ({ page }) => {
  await register(page, uniqueEmail());
  await addTask(page, 'Buy milk', 'Two litres');

  await page.getByRole('button', { name: 'Edit Buy milk' }).click();
  const form = page.getByRole('form', { name: 'Edit task' });
  await form.getByLabel('Title').fill('Buy oat milk');
  await form.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Buy oat milk', { exact: true })).toBeVisible();
  await expect(page.getByText('Buy milk', { exact: true })).toHaveCount(0);
});

test('filter shows the right tasks and survives a reload', async ({ page }) => {
  await register(page, uniqueEmail());
  await addTask(page, 'Active task');

  await page.getByRole('button', { name: 'Completed' }).click();
  await expect(page).toHaveURL(/status=completed/);
  await expect(page.getByText('Active task', { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Completed' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'Active' }).click();
  await expect(page.getByText('Active task', { exact: true })).toBeVisible();
});

test('another account never sees the first account tasks', async ({ page }) => {
  await register(page, uniqueEmail());
  await addTask(page, 'Private task');
  await page.getByRole('button', { name: 'Log out' }).click();

  await register(page, uniqueEmail());
  await expect(page.getByText('Private task', { exact: true })).toHaveCount(0);
});

test.describe('accessibility', () => {
  test('login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('register page', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('task list page', async ({ page }) => {
    await register(page, uniqueEmail());
    await addTask(page, 'A11y task');
    await expectNoSeriousA11yViolations(page);
  });
});
