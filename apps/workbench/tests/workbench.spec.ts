import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readRegistry } from '../scripts/dkp.mjs';
import type { PrototypeData, Part } from '../src/types';
const device=(await readRegistry()).workspaces.find((w:{id:string})=>w.id==='microduck');
const selectedSnapshotId=device.selectedSnapshotId;
let data:PrototypeData,target:Part,servo:Part;
const explorerUrl=(part:string)=>'/#explorer?'+new URLSearchParams({workspace:device.id,snapshot:selectedSnapshotId,part});
test.beforeAll(async()=>{test.setTimeout(360000);data=await(await fetch(`http://127.0.0.1:8780/api/workspaces/microduck/snapshots/${selectedSnapshotId}/view`)).json();target=data.parts.find(p=>p.meshKey==='motor_support')!;servo=data.parts.find(p=>p.id==='part:microduck:0820b4025f26a004')!;});
test('中文查询到部件，再定位到真实 XML 与 CSV 证据', async ({ page }) => {
  await page.goto('/#explorer');
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({ timeout: 30000 });
  await page.getByRole('textbox', { name: '查找部件或 ID', exact: true }).fill(target.id);
  await page.getByRole('button', { name: `隐藏 ${target.id}`, exact: true }).click();
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: '全局搜索', exact: true }).fill('电机支架');
  await page.locator('.command-result').filter({ hasText: target.id }).click();
  await expect(page.locator('.object-id')).toContainText(target.id);
  await expect(page.locator('.tree-row.selected')).toContainText(target.name);
  await expect(page.locator('.tree-row.selected')).not.toHaveClass(/hidden-part/);
  await page.getByRole('combobox', { name: '对象详情分类' }).selectOption('evidence');
  await page.locator('.evidence-card').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('robot_walk.xml');
  await expect(dialog.locator('.bp-document-line.is-evidence')).toContainText('motor_support');
  const line = dialog.locator('.bp-document-line.is-evidence').first();
  await expect(line).toBeInViewport();
  await page.getByRole('button', { name: '复制来源定位', exact: true }).click();
  await expect(page.getByRole('button', { name: '已复制定位', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.locator('.evidence-card').nth(1).click();
  await expect(page.getByRole('dialog').locator('.bp-document-line.is-evidence')).toContainText('motor_support.stl');
  await expect(page.getByRole('dialog').locator('.bp-document-line.is-evidence')).toContainText('电机支架');
});


test('窄屏保持导航、模型与详情可用且没有页面级横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#explorer');
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.viewport')).toBeVisible();
  await expect(page.getByRole('button', { name: '仅显示选中部件', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.inspector').scrollIntoViewIfNeeded();
  await expect(page.locator('.object-heading h2')).toBeInViewport();
  await page.locator('.nav-item').filter({ hasText: '来源资料' }).click();
  await expect(page.locator('.bp-page-heading h1')).toHaveText('来源资料');
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);
});


test('分享链接恢复实际旋转视角、部件可见性和展示状态', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#explorer');
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: '展开', exact: true }).click();
  await page.getByRole('button', { name: '切换部件标签', exact: true }).click();
  await page.getByRole('button', { name: '切换透明显示', exact: true }).click();
  await page.locator('.tree-visibility').first().click();
  await page.waitForTimeout(700); // Wait for the automatic fit and explosion transition before orbiting.
  const bounds = await page.locator('canvas').boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2 + 130, bounds!.y + bounds!.height / 2 - 45, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(700); // Let OrbitControls damping settle before capturing a bookmark.
  await page.getByRole('button', { name: '复制视图链接', exact: true }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const params = new URLSearchParams(new URL(link).hash.split('?')[1]);
  const expectedCamera = params.get('camera')!.split(',').map(Number);
  expect(expectedCamera).toHaveLength(6);
  expect(params.get('hidden')).toBeTruthy();
  expect(params.get('labels')).toBe('0');
  expect(params.get('xray')).toBe('1');

  await page.goto(link);
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('slider', { name: '爆炸展开程度' })).toHaveValue('100');
  await expect(page.getByRole('button', { name: '切换部件标签', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: '切换透明显示', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.tree-row.hidden-part')).toHaveCount(1);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出视图', exact: true }).click();
  const manifest = JSON.parse(readFileSync((await (await downloading).path())!, 'utf8'));
  const restored = [...manifest.camera.position, ...manifest.camera.target];
  restored.forEach((number: number, index: number) => expect(number).toBeCloseTo(expectedCamera[index], 6));
  expect(manifest.hiddenIds).toEqual(params.get('hidden')!.split(','));
});


test('同一设备在三个能力间保持知识版本，未接入服务不制造运行结果', async ({ page }) => {
  await page.goto('/#build');
  await expect(page.locator('.cap-snapshot-panel')).toContainText(data.meta.packageVersion);
  await expect(page.locator('.cap-capability-list')).toContainText('机械验证');
  await expect(page.locator('.cap-capability-list')).toContainText('未提供');
  await expect(page.getByRole('button', { name: '回放构建流程', exact: true })).toHaveCount(0);
  const params = () => new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
  const snapshotId = params().get('snapshot');
  await page.locator('.nav-item').filter({ hasText: 'Simulate' }).click();
  await expect(page.locator('.simulate-page')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.simulation-canvas')).toHaveAttribute('data-sim-ready', 'true', { timeout: 30000 });
  await page.getByRole('button', { name: '方案菜单', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '选择装配方案' })).toBeVisible();
  expect(params().get('workspace')).toBe(device.id);
  expect(params().get('snapshot')).toBe(snapshotId);
  await page.getByRole('button', { name: '返回工作台', exact: true }).click();
  await page.locator('.nav-item').filter({ hasText: 'Compile' }).click();
  await page.getByRole('tab', { name: '训练实验', exact: true }).click();
  await expect(page.locator('.cap-execution-empty')).toContainText('尚无训练实验或运行');
  expect(params().get('snapshot')).toBe(snapshotId);
  await page.reload();
  await expect(page.locator('.bp-page-heading h1')).toContainText('Compile');
  await expect(page.locator('.cap-context')).toContainText(data.meta.packageVersion);
});


test('知识版本切换加载对应DKP，并能返回另一版本', async ({ page }) => {
  test.setTimeout(360000);
  test.skip(device.snapshots.length < 2, 'This integration journey needs two published v2 snapshots.');
  await page.goto('/#build');
  await expect(page.locator('.cap-snapshot-panel')).toBeVisible();
  await expect(page).toHaveURL(/snapshot=dkp-/);
  const currentId = new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('snapshot');
  const current = device.snapshots.find((item: { id: string }) => item.id === currentId)!;
  const another = [...device.snapshots].reverse().find((item: { id: string }) => item.id !== currentId)!;
  await page.getByRole('button', { name: '选择设备工作区', exact: true }).click();
  await page.getByRole('combobox', { name: '选择知识版本', exact: true }).selectOption(another.id);
  await expect(page).toHaveURL(new RegExp(`snapshot=${another.id}`));
  await expect(page.locator('.cap-history-panel tr.is-current')).toHaveCount(1, { timeout: 335000 });
  await expect(page.locator('.cap-digest code')).toHaveText(another.packageDigest, { timeout: 335000 });
  await page.locator('.cap-history-panel tbody tr').filter({ hasText: current.packageDigest.slice(0, 16) }).getByRole('button', { name: '打开版本', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`snapshot=${currentId}`));
});

test('旧快照清理后，收藏链接自动打开当前包并保留可识别部件',async({page})=>{
  await page.route('**/api/workspaces',async route=>{
    const response=await route.fetch();const catalog=await response.json();
    for(const workspace of catalog.workspaces)workspace.snapshots=workspace.snapshots.filter((snapshot:{id:string})=>snapshot.id===workspace.selectedSnapshotId);
    await route.fulfill({response,json:catalog});
  });
  await page.goto('/#explorer?'+new URLSearchParams({workspace:device.id,snapshot:'dkp-removed-old-snapshot',part:servo.id}));
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({timeout:30000});
  await expect(page).toHaveURL(new RegExp('snapshot='+selectedSnapshotId));
  await expect(page.locator('.object-id')).toContainText(servo.id);
  await expect(page.locator('.version-chip')).toContainText(data.meta.packageVersion);
  await expect(page.getByRole('alert')).toHaveCount(0);
});


test('空设备工作区可选择，返回已有设备后恢复真实内容', async ({ page }) => {
  await page.route('**/api/workspaces', async route => {
    const response = await route.fetch();
    const catalog = await response.json();
    catalog.workspaces.push({ id: 'qa-empty-device', deviceId: 'qa-empty-device', name: '测试空设备', description: '', snapshots: [] });
    await route.fulfill({ response, json: catalog });
  });
  await page.goto('/#build');
  await page.getByRole('button', { name: '选择设备工作区', exact: true }).click();
  await page.locator('.workspace-popover > button').filter({ hasText: '测试空设备' }).click();
  await expect(page.locator('.startup')).toContainText('尚无');
  await expect(page).toHaveURL(/workspace=qa-empty-device/);
  await page.reload();
  await expect(page.locator('.startup')).toContainText('此设备尚无知识版本');
  await expect(page).toHaveURL(/workspace=qa-empty-device/);
  await page.locator('.startup-contexts > button').filter({ hasText: 'Microduck' }).click();
  await expect(page.locator('.cap-snapshot-panel')).toContainText(data.meta.packageVersion);
  await expect(page).toHaveURL(/workspace=microduck/);
});



test('对象详情可拖拽和键盘调宽，取消与窄屏不覆盖首选宽度', async ({ page }) => {
  await page.goto(explorerUrl(servo.id));
  const bench = page.locator('.workbench');
  const pane = page.locator('.inspector');
  const handle = page.getByRole('separator', { name: '调整对象详情宽度' });
  await expect(handle).toHaveAttribute('aria-valuenow', '380');
  const start = (await handle.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + 100);
  await page.mouse.down();
  await page.mouse.move(start.x - 120, start.y + 100);
  await page.mouse.up();
  await expect.poll(async () => (await pane.boundingBox())!.width).toBeGreaterThan(490);
  await expect.poll(() => page.evaluate(() => Number(localStorage.getItem('psop.workbench.inspector-width')))).toBeGreaterThan(490);
  await handle.focus();
  await page.keyboard.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', '640');
  await page.getByRole('button', { name: '仅显示选中部件', exact: true }).click();
  const cancelStart = (await handle.boundingBox())!;
  await page.mouse.move(cancelStart.x + 4, cancelStart.y + 100); await page.mouse.down();
  await page.mouse.move(cancelStart.x + 80, cancelStart.y + 100);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', '640');
  await expect(page.locator('.isolation-notice')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('psop.workbench.inspector-width'))).toBe('640');
  await page.reload();
  await expect(handle).toHaveAttribute('aria-valuenow', '640');
  await page.setViewportSize({ width: 1040, height: 900 });
  await expect.poll(async () => Number(await handle.getAttribute('aria-valuenow'))).toBeLessThan(640);
  await expect(bench).toHaveAttribute('data-inspector-preferred-width', '640');
  await expect.poll(async () => (await page.locator('.viewport').boundingBox())!.width).toBeGreaterThanOrEqual(479);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect(handle).toHaveAttribute('aria-valuenow', '640');
  const leaving = (await handle.boundingBox())!;
  await page.mouse.move(leaving.x + 4, leaving.y + 100); await page.mouse.down();
  await page.mouse.move(leaving.x + 60, leaving.y + 100);
  await page.getByRole('button', { name: '知识浏览', exact: true }).focus(); await page.keyboard.press('Enter');
  await page.mouse.up();
  await expect(page.locator('html')).not.toHaveClass(/inspector-is-resizing/);
  await page.getByRole('button', { name: '设备总览', exact: true }).click();
  await expect(handle).toHaveAttribute('aria-valuenow', '640');
  await handle.focus(); await page.keyboard.press('Home');
  await expect(handle).toHaveAttribute('aria-valuenow', '320');
  await handle.dblclick({ position: { x: 4, y: 100 } });
  await expect(handle).toHaveAttribute('aria-valuenow', '380');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(handle).toHaveCount(0);
  await expect(bench).toHaveClass(/inspector-stacked/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect(handle).toHaveAttribute('aria-valuenow', '380');
});
