// End-to-end browser tests driving the real stack (real backend + production
// frontend build behind a same-origin /api proxy) exactly as a user would.
import { test, expect } from 'playwright/test';
import { makeMultiPagePdf } from '../../backend/test/pdfgen.js';

const PASSWORD = 'StrongPass123';
const NAME = 'E2E Tester';
let seq = 0;
const uniqEmail = () => `e2e.${Date.now()}.${(seq += 1)}@studymate.test`;

// Sign up a fresh, unique account and land on the authenticated home page.
async function register(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign up' }).first().click();
  await expect(page.getByText('Create your StudyMate account')).toBeVisible();

  const email = uniqEmail();
  await page.getByPlaceholder('Full name', { exact: true }).fill(NAME);
  await page.getByPlaceholder('Email address', { exact: true }).fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill(PASSWORD);
  await page.getByPlaceholder('Confirm password', { exact: true }).fill(PASSWORD);

  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  // Authenticated: redirect off /login onto the home page (hero renders).
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
  await expect(page.getByText('Welcome to StudyMate AI')).toBeVisible({ timeout: 15000 });
  return { email, name: NAME };
}

test('unauthenticated users are redirected to login (route guard)', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});

test('full user journey: register -> upload -> READY -> dashboard -> chat', async ({ page }) => {
  const { email } = await register(page);

  // Reader: upload a real 3-page PDF (async ingest will process it).
  await page.getByRole('link', { name: /Reader/i }).first().click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'physics-notes.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(makeMultiPagePdf([
      'newton laws of motion physics',
      'energy conservation thermodynamics',
      'projectile motion mechanics physics',
    ])),
  });

  // Async ingest: wait for the document row to show READY.
  await expect(page.getByText('physics-notes.pdf').first()).toBeVisible({ timeout: 15_000 });
  await page.reload();
  // Badge renders the status title-cased ("Ready"); async ingest reached READY.
  await expect(page.getByText('Ready', { exact: true }).first()).toBeVisible({ timeout: 30_000 });

  // Dashboard renders real content (no error/placeholder path).
  await page.getByRole('link', { name: /Dashboard/i }).first().click();
  await expect(page.locator('body')).not.toContainText('Failed to load');
  await expect(page.getByRole('link', { name: /Reader/i }).first()).toBeVisible();

  // Chat: ask a question; the stub AI provider returns a grounded reply.
  await page.getByRole('link', { name: /Chat/i }).first().click();
  // The message input only appears once a chat exists; create one first.
  await page.getByRole('button', { name: /New Chat/i }).first().click();
  const input = page.getByPlaceholder('Ask a question about your documents...', { exact: true });
  await input.fill('Explain the first law of motion');
  await input.locator('xpath=../button').click();
  await expect(page.getByText(/grounded stub answer/i).first()).toBeVisible({ timeout: 20_000 });

  // Settings: profile reflects the authenticated user's email.
  await page.getByRole('link', { name: /Settings/i }).first().click();
  // The profile email is shown in a disabled input; assert its value.
  await expect(page.locator('input[disabled]').first()).toHaveValue(email, { timeout: 15_000 });
});

test('dashboard loads for a fresh account', async ({ page }) => {
  await register(page);
  await page.getByRole('link', { name: /Dashboard/i }).first().click();
  await expect(page.locator('body')).not.toContainText('Failed to load');
  await expect(page.getByRole('link', { name: /Reader/i }).first()).toBeVisible();
});
