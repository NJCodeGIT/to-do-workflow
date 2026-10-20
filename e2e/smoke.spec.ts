import { expect, test, type Page } from '@playwright/test';
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

const itemOf = (page: Page, title: string) =>
  page.getByRole('listitem').filter({ has: page.getByText(title, { exact: true }) });

test('complete a task: it moves to Completed, survives a reload, and can be reopened', async ({
  page,
}) => {
  await register(page, uniqueEmail());
  await addTask(page, 'Buy milk');

  await page.getByRole('button', { name: 'Complete Buy milk', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reopen Buy milk', exact: true })).toBeVisible();
  await expect(itemOf(page, 'Buy milk').getByText('Completed', { exact: true })).toBeVisible();
  await expect(page.getByText('Task completed.', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Active', exact: true }).click();
  await expect(page).toHaveURL(/status=active/);
  await expect(page.getByText('Buy milk', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(page).toHaveURL(/status=completed/);
  await expect(page.getByText('Buy milk', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Completed', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(itemOf(page, 'Buy milk').getByText('Completed', { exact: true })).toBeVisible();

  // Reopen from Completed: it leaves the view and is back under Active.
  await page.getByRole('button', { name: 'Reopen Buy milk', exact: true }).click();
  await expect(page.getByText('Buy milk', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Task reopened\./)).toBeVisible();
  await page.getByRole('button', { name: 'Active', exact: true }).click();
  await expect(itemOf(page, 'Buy milk').getByText('Active', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete Buy milk', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Buy milk', { exact: true })).toBeVisible();
});

test('delete a task: Cancel keeps it, confirming removes it for good', async ({ page }) => {
  await register(page, uniqueEmail());
  await addTask(page, 'Call Bob');
  await addTask(page, 'Buy milk');

  await page.getByRole('button', { name: 'Delete Call Bob', exact: true }).click();
  const prompt = page.getByRole('group', { name: 'Confirm delete' });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByText('Delete "Call Bob"? This cannot be undone.')).toBeVisible();
  await prompt.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByText('Call Bob', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Delete Call Bob', exact: true }).click();
  await prompt.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Call Bob', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Task deleted.', { exact: true })).toBeVisible();
  await expect(page.getByText('Buy milk', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Buy milk', { exact: true })).toBeVisible();
  await expect(page.getByText('Call Bob', { exact: true })).toHaveCount(0);
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

  test('task list with a completed task', async ({ page }) => {
    await register(page, uniqueEmail());
    await addTask(page, 'A11y done');
    await page.getByRole('button', { name: 'Complete A11y done', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reopen A11y done', exact: true })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('task list with the delete prompt open', async ({ page }) => {
    await register(page, uniqueEmail());
    await addTask(page, 'A11y prompt');
    await page.getByRole('button', { name: 'Delete A11y prompt', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Confirm delete' })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});
