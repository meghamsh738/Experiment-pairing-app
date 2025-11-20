import { test, expect } from '@playwright/test'
import { promises as fs } from 'fs'

test('example data flow renders results and exports state', async ({ page }) => {
  await page.goto('/')

  // Use bundled example data
  await page.getByLabel('Use Example Data').check()

  // Distribute into groups
  await page.getByTestId('process-btn').click()
  await expect(page.getByText('Group 1')).toBeVisible()

  // Switch to pairing mode and pair animals
  await page.getByTestId('mode-pair').click()
  await page.getByTestId('process-btn').click()
  await expect(page.getByText('Pair 1')).toBeVisible()

  // Capture evidence screenshot
  await fs.mkdir('screenshots', { recursive: true })
  await page.screenshot({ path: 'screenshots/example_run.png', fullPage: true })
})
