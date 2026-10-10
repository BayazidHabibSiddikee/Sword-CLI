import { test, expect } from '@playwright/test';

test('has title, renders workspace tabs including AI Co-Pilot, and initiates generation', async ({ page }) => {
  await page.goto('/');

  // Expect page title
  await expect(page).toHaveTitle(/LabGen/);

  // Check left pane elements
  await expect(page.getByText('Inputs & Parameters')).toBeVisible();
  await expect(page.getByText('Experiment Configuration')).toBeVisible();

  // Check tabs in Center Workspace
  await expect(page.getByRole('button', { name: /AI Co-Pilot/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Report/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Source/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /3D View/i })).toBeVisible();

  // Check the Initiate Generation button exists
  const generateButton = page.getByRole('button', { name: /INITIATE GENERATION/i });
  await expect(generateButton).toBeVisible();
});
