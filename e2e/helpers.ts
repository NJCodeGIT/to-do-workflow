import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'correct-horse-battery';

// Each test gets its own user so tests stay independent (the DB is fresh per run, not per test).
export function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export async function register(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your tasks' })).toBeVisible();
}

export async function addTask(page: Page, title: string, description?: string): Promise<void> {
  await page.getByLabel('Title', { exact: true }).fill(title);
  if (description) await page.getByLabel('Description (optional)').fill(description);
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

// Fails on serious or critical violations only; manual review stays in the quality-tester checklist.
export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, serious.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
}
