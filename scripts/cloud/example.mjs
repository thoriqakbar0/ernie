export default async function ({ page, step, url }) {
  await step('Open Ernie', async () => {
    await page.goto(url);
    await page.locator('body').waitFor({ state: 'visible' });
  });
  // Add actions using controls observed in the current UI.
  // Keep each meaningful interaction inside await step(label, async () => { ... }).
}
