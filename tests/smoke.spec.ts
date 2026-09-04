import { test, expect } from '@playwright/test'
import { captureConsoleErrors } from './helpers/errors'

/**
 * Smoke tests covering both page kinds this template ships:
 *   - '/'      → the static landing (top level of src/pages/): no providers,
 *                so no auth fetch and no records WebSocket on load.
 *   - '/home'  → a dynamic page (under src/pages/(app)/): the providers mount,
 *                the nav shell renders, and the records WebSocket connects.
 *
 * The "static contract" test is the guardrail for the per-page opt-out: if
 * someone moves the providers back up into _app.tsx, it fails.
 */

/** Wait for the React app shell (present on every page). */
async function waitForApp(page: import('@playwright/test').Page) {
  await page.waitForSelector('[data-testid="app-root"]', { timeout: 15000 })
}

test.describe('Smoke tests', () => {
  test('static landing loads without JS errors', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    await page.goto('/')
    await waitForApp(page)
    await expect(
      page.getByRole('heading', {
        name: 'Turn one rough idea into something you can see and hear.',
      }),
    ).toBeVisible()
    expect(errors).toEqual([])
  })

  test('static contract: landing fires no auth request, opens no websocket', async ({
    page,
  }) => {
    const offenders: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/')) offenders.push(req.url())
    })
    // Only the DO room route counts — vite's own HMR socket is a dev artifact.
    page.on('websocket', (ws) => {
      if (new URL(ws.url()).pathname.startsWith('/ws/'))
        offenders.push(`ws: ${ws.url()}`)
    })
    await page.goto('/')
    await expect(
      page.getByRole('heading', {
        name: 'Turn one rough idea into something you can see and hear.',
      }),
    ).toBeVisible()
    await page.waitForTimeout(1500)
    expect(offenders).toEqual([])
  })

  test('dynamic app boundary mounts on /home', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByTestId('app-navigation')).toBeVisible({
      timeout: 15000,
    })
    await expect(
      page.getByRole('heading', { name: 'Shape the brief' }),
    ).toBeVisible()
    await expect(page.getByLabel('Creator prompt')).toBeVisible()
    await expect(page.getByText('This is a placeholder page.')).toHaveCount(0)
    await expect(page).toHaveTitle(/MotionBrief/)
  })

  test('sign-in button visible when logged out', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByTestId('nav-sign-in-button')).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByTestId('nav-user-name')).toHaveCount(0)
  })

  test('an unsaved new prompt survives an auth-style return to /home', async ({
    page,
  }) => {
    const prompt = 'A tiny camera captures an overnight train journey'
    // Entering through the nav lands on plain `/home`, where a signed-out
    // visitor still sees an empty studio and can begin typing.
    await page.goto('/home')
    await page.getByLabel('Creator prompt').fill(prompt)

    // Simulate OAuth returning to the same plain route. A pending prompt must
    // become explicit new-project intent before signed-in records can load.
    await page.reload()

    await expect(page).toHaveURL(/\/home\?new=1$/)
    await expect(page.getByLabel('Creator prompt')).toHaveValue(prompt)
    await expect(
      page.getByRole('heading', { name: 'Untitled creative brief' }),
    ).toBeVisible()
  })

  test('unknown route shows 404', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz')
    await waitForApp(page)
    await expect(page.locator('text=404')).toBeVisible()
  })
})
