import { test, expect } from '@playwright/test'
import { Buffer } from 'node:buffer'

test('example data flow renders results and exports state', async ({ page }) => {
  await page.goto('/')
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; } .signature { display: none !important; }' })

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
  await expect(page).toHaveScreenshot('example_run.png', { fullPage: true })
})

test('seeded groups can be reviewed, locked, reopened, and exported', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Use Example Data').check()
  await page.getByTestId('process-btn').click()

  const review = page.getByTestId('allocation-review-summary')
  await expect(review).toBeVisible()
  await expect(review).toContainText('Balanced search')
  await expect(review).toContainText('Seed 42')
  await expect(review).toContainText('Eligible pool: 14')
  await expect(review).toContainText('Assigned: 14')
  await expect(page.getByText('5 / 5')).toBeVisible()

  await page.getByRole('button', { name: 'Lock here' }).first().click()
  await expect(page.getByRole('button', { name: 'Locked · unlock' }).first()).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('pairing-export-btn').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('animal_allocation.xlsx')

  await page.reload()
  await expect(page.getByTestId('allocation-review-summary')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Locked · unlock' }).first()).toBeVisible()
})

test('CSV upload preserves declared age units and blocks a mismatch', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'unit-animals.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      'Animal ID No.,Genotype Class,Sex,Age (w),Age Unit,Cage',
      'B1,WT,M,8,weeks,Cage 4',
      'B2,WT,F,9,weeks,Cage 5',
      'B3,KO,M,10,weeks,Cage 6',
      'B4,KO,F,11,weeks,Cage 7',
    ].join('\n')),
  })

  await expect(page.getByText('Parsed animals: 4')).toBeVisible()
  await expect(page.getByText(/age value\(s\) specify a unit/)).toHaveCount(0)
  await page.getByLabel('Age unit').selectOption('days')
  await expect(page.getByText('4 age value(s) specify a unit different from the selected days.')).toBeVisible()
  await page.getByTestId('process-btn').click()
  await expect(page.getByRole('alert')).toContainText('selected age unit is days')

  await page.getByLabel('Age unit').selectOption('weeks')
  await page.getByTestId('process-btn').click()
  await expect(page.getByTestId('allocation-review-summary')).toBeVisible()
  await expect(page.getByTestId('allocation-review-summary')).toContainText('weeks')
})

test('saved genotype selection remains in force after reopening', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Use Example Data').check()
  await page.getByRole('button', { name: 'KO' }).click()
  await page.getByRole('button', { name: 'CRE' }).click()
  await page.getByTestId('process-btn').click()
  await expect(page.getByTestId('allocation-review-summary')).toContainText('Eligible pool: 6')

  await page.reload()
  await expect(page.getByTestId('allocation-review-summary')).toBeVisible()
  await expect(page.getByTestId('allocation-review-summary')).toContainText('Eligible pool: 6')
  await expect(page.getByRole('button', { name: 'KO' })).not.toHaveClass(/active-pill/)
  await expect(page.getByRole('button', { name: 'CRE' })).not.toHaveClass(/active-pill/)
})
