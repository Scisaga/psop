import { test, expect, type Route } from '@playwright/test';

test('长时间读取说明等待原因，校验失败显示服务返回的具体原因', async ({ page }) => {
  let viewRequest: Route | undefined;
  await page.route('**/api/workspaces/*/snapshots/*/view', route => { viewRequest = route; });
  await page.goto('/#explorer?workspace=microduck');
  await expect(page.getByText('正在打开 Microduck', { exact: true })).toBeVisible();
  const progress = page.getByRole('status');
  await expect(progress).toContainText('首次打开或内容更新后会校验模型完整性', { timeout: 15000 });
  await expect(progress).toContainText(/已等待 \d+ 秒/);
  expect(viewRequest).toBeTruthy();
  await viewRequest!.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'Package file integrity mismatch: sources/source.txt' }) });
  await expect(page.getByRole('alert')).toContainText('Package file integrity mismatch: sources/source.txt');
  await expect(progress).not.toBeVisible();
});
