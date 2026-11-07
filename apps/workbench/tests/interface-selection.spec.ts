import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Quaternion, Vector3 } from 'three';
import { defaultRegistry, readRegistry } from '../scripts/dkp.mjs';
import type { CircularOpening, InstallationHypothesis, Part, PrototypeData, Vec3 } from '../src/types';

const registry = await readRegistry();
const workspace = registry.workspaces.find((item: { deviceId: string }) => item.deviceId === 'microduck');
if (!workspace?.snapshots.length) throw new Error('Prepare and register the Microduck workspace.');
const snapshotId = workspace.selectedSnapshotId || workspace.snapshots.at(-1).id;
const historical = workspace.snapshots.find((item: { path: string }) => JSON.parse(readFileSync(path.resolve(path.dirname(defaultRegistry), item.path, 'manifest.json'), 'utf8')).profile === 'psop.hardware.source-model/1.9');
let data: PrototypeData;
let shell: Part;

test.beforeAll(async () => {
  test.setTimeout(360000);
  const response = await fetch(`http://127.0.0.1:8780/api/workspaces/${workspace.id}/snapshots/${snapshotId}/view`, { signal: AbortSignal.timeout(330000) });
  if (!response.ok) throw new Error(await response.text());
  data = await response.json();
  expect(['psop.hardware.source-model/1.10', 'psop.hardware.source-model/1.11']).toContain(data.meta.validation?.profile);
  shell = data.parts.find(item => item.meshKey === 'right_shell')!;
  expect(shell).toBeTruthy();
});

// Locations come from the reported right-shell sites, then checked by raw STL
// plane sections (RS-DISPLAY-X/Z), independently of Build's circle detector.
const sites: { key: string; center: Vec3; axis: Vec3; diameter: string }[] = [
  { key: 'y42-z52', center: [-.0003, .042, .0525], axis: [1, 0, 0], diameter: 'Ø1.60' },
  { key: 'x25-y9', center: [-.0255, -.0095, .0425], axis: [0, 0, 1], diameter: 'Ø2.20' },
];
function sourceOpening(site: typeof sites[number]) {
  const item = data.analysis!.circular_openings!.find(opening => opening.owner_ref === shell.id && opening.geometry.center.every((value, i) => Math.abs(value - site.center[i]) < 1e-5));
  expect(item, `Locate the independently reviewed right-shell site ${site.key}`).toBeTruthy();
  return item!;
}
function openingUrl(opening: CircularOpening, site: typeof sites[number]) {
  const quaternion = new Quaternion().fromArray(shell.quaternion);
  const center = new Vector3().fromArray(opening.geometry.center).applyQuaternion(quaternion).add(new Vector3().fromArray(shell.position));
  const direction = new Vector3().fromArray(site.axis).applyQuaternion(quaternion).normalize();
  const tangent = new Vector3(1, .3, .2).addScaledVector(direction, -new Vector3(1, .3, .2).dot(direction)).normalize();
  const camera = [...center.clone().addScaledVector(direction, .018).addScaledVector(tangent, .018 * .25).toArray(), ...center.toArray()];
  return '/#explorer?' + new URLSearchParams({ workspace: workspace.id, snapshot: snapshotId, part: shell.id, detail: 'geometry', opening: opening.id, isolate: shell.id, labels: '0', grid: '0', camera: camera.join(','), explode: '0' });
}
const hypothesisUrl = (item: InstallationHypothesis, ownerRef: string) => '/#explorer?' + new URLSearchParams({ workspace: workspace.id, snapshot: snapshotId, part: ownerRef, detail: 'interfaces', hypothesis: item.id, labels: '0', grid: '0', explode: '0' });
async function ready(page: Page) {
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({ timeout: 335000 });
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-camera-flight', 'settled');
}

for (const site of sites) {
  test(`右外壳 ${site.key}：人工复核后的局部画面保持边界与有限壁面`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const opening = sourceOpening(site);
    await page.goto(openingUrl(opening, site));
    await ready(page);
    const details = page.locator('.physical-location-detail');
    await expect(details.locator(`[data-selected-opening-id="${opening.id}"]`)).toContainText(site.diameter);
    await expect(details).toContainText('在哪里');
    await expect(details).toContainText('这里包含什么');
    await expect(details).toContainText('可能连接谁');
    await expect(page.locator('[data-raw-geometry-records]')).not.toHaveAttribute('open');
    await expect(page.locator('.geometry-tabs')).not.toBeVisible();
    // These baselines are accepted only after reviewing the rendered PNGs.
    // A reintroduced ring of triangle edges changes pixels, even if all data
    // attributes, coordinates and the screenshot filename remain correct.
    const canvas = page.locator('.scene-webgl');
    const screenshotOptions = {
      maxDiffPixels: 180, threshold: .15, animations: 'disabled' as const,
      // Locator screenshots include DOM above the canvas. Hide this control
      // during capture so the negative check detects mesh edges themselves.
      stylePath: path.resolve(path.dirname(defaultRegistry), '../apps/workbench/tests/fixtures/selection-capture.css'),
    };
    await expect(canvas).toHaveScreenshot(`right-shell-${site.key}.png`, screenshotOptions);
    if (site.key === 'x25-y9') {
      await page.locator('.scene-analysis-tools > summary').click();
      await page.getByRole('checkbox', { name: '整件特征边线', exact: true }).check();
      await expect(page.locator('.scene-canvas')).toHaveAttribute('data-mesh-edges', 'source_creases');
      await expect(canvas).not.toHaveScreenshot(`right-shell-${site.key}.png`, screenshotOptions);
      await page.getByRole('checkbox', { name: '整件特征边线', exact: true }).uncheck();
      await expect(canvas).toHaveScreenshot(`right-shell-${site.key}.png`, screenshotOptions);
    }
  });
}

test('同一右外壳上下文切换两处位置、旋转缩放、隔离与取消选择', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const first = sourceOpening(sites[0]), second = sourceOpening(sites[1]);
  await page.goto(openingUrl(first, sites[0]));
  await ready(page);
  const scene = page.locator('.scene-canvas');
  const picker = page.getByRole('combobox', { name: '选择物理位置', exact: true });
  const firstPosition = await picker.inputValue();
  await picker.selectOption(second.id);
  await expect(scene).toHaveAttribute('data-opening-highlight', second.id);
  await expect(page.locator('.object-id')).toContainText(shell.id);
  await expect(page.locator('.tree-row.selected')).toContainText(shell.name);
  const bounds = (await scene.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * .55, bounds.y + bounds.height * .5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .65, bounds.y + bounds.height * .57, { steps: 12 });
  await page.mouse.up();
  await page.mouse.wheel(0, -130);
  await expect(scene).toHaveAttribute('data-opening-highlight', second.id);
  await page.getByRole('button', { name: '仅显示选中部件', exact: true }).click();
  await expect(page.locator('.isolation-notice')).toHaveCount(0);
  await page.getByRole('button', { name: '仅显示选中部件', exact: true }).click();
  await expect(page.locator('.isolation-notice')).toBeVisible();
  await page.getByRole('button', { name: '清除几何标注', exact: true }).click();
  await expect(scene).toHaveAttribute('data-opening-highlight', '');
  await expect(page.locator('.interface-location-notice')).toHaveCount(0);
  await picker.selectOption(firstPosition);
  await page.locator('.structure-composition-members > summary').click();
  await page.locator(`.structure-composition-members [data-geometry-id="${first.id}"]`).click();
  await expect(scene).toHaveAttribute('data-opening-highlight', first.id);
  expect(errors).toEqual([]);
});

test('右壳安装假设贯通发布知识、具体角色、来源、双向定位及导出', async ({ page }) => {
  const item = data.analysis!.installation_hypotheses!.find(hypothesis => hypothesis.participants.some(participant => participant.part_ref === shell.id) && hypothesis.participants.some(participant => data.parts.some(part => part.id === participant.part_ref && part.meshKey === 'left_shell')))!;
  expect(item, 'The shell seam needs a specific source-supported relationship, not a generic to-do').toBeTruthy();
  const response = await page.request.get(`/api/workspaces/${workspace.id}/snapshots/${snapshotId}/knowledge`);
  expect(response.ok()).toBe(true);
  const knowledge = await response.json();
  expect(knowledge.installation_hypotheses).toContainEqual(item);
  expect(knowledge.interface_connections).toEqual([]);
  await page.goto(hypothesisUrl(item, shell.id));
  await ready(page);
  const card = page.locator(`[data-installation-hypothesis-id="${item.id}"]`);
  await expect(card).toHaveAttribute('data-hypothesis-status', 'supported_hypothesis');
  await expect(card).toContainText('待验证安装假设');
  await expect(card).toContainText('本件部位');
  await expect(card.locator('[data-hypothesis-evidence="support"]')).toContainText(item.supporting_evidence[0].claim);
  await expect(card).toContainText('还缺什么');
  const measurements = card.locator('.hypothesis-measurements');
  await measurements.locator('summary').click();
  await expect(measurements).toContainText('源几何测量');
  await card.locator('[data-hypothesis-evidence="support"] .mechanics-source-link').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  const peer = item.participants.find(participant => participant.part_ref !== shell.id)!;
  await card.locator(`[data-hypothesis-participant="${peer.part_ref}"]`).click();
  await expect(page.locator('.object-id')).toContainText(peer.part_ref);
  await expect(card.locator('.hypothesis-card-heading')).toBeInViewport();
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-geometry-authority', 'project_inferred');
  await expect(page).toHaveURL(new RegExp(`hypothesis=${encodeURIComponent(item.id)}`));
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出视图', exact: true }).click();
  const exported = JSON.parse(readFileSync((await (await downloading).path())!, 'utf8'));
  expect(exported.geometrySelection).toMatchObject({ kind: 'installation_hypothesis', id: item.id, ownerRef: peer.part_ref });
  expect(exported.packageDigest).toBe(data.meta.packageDigest);
});

test('另一类支承件有具体新关系，右壳Z孔的已调查缺证仍明确保留', async ({ page }) => {
  const support = data.parts.find(part => part.meshKey === 'bearing_roll')!;
  expect(support).toBeTruthy();
  const item = data.analysis!.installation_hypotheses!.find(hypothesis => hypothesis.participants.some(participant => participant.part_ref === support.id))!;
  expect(item, 'New analysis must extend beyond the previously declared leg, thigh and servo cases').toBeTruthy();
  expect(data.analysis!.mounting_interfaces!.filter(definition => definition.owner_ref === support.id)).toHaveLength(0);
  await page.goto(hypothesisUrl(item, support.id));
  await ready(page);
  const card = page.locator(`[data-installation-hypothesis-id="${item.id}"]`);
  await expect(card).toContainText(item.mechanism.summary);
  await expect(card).toContainText('支持依据');
  await expect(card).toContainText('反证与不一致');
  await expect(card).toContainText('还缺什么');
  const zOpening = sourceOpening(sites[1]);
  await page.goto(openingUrl(zOpening, sites[1]));
  await ready(page);
  const record = page.locator('.physical-location-detail [data-investigation-record-id]');
  await expect(record).toHaveAttribute('data-work-status', 'investigated');
  await expect(record).toHaveAttribute('data-evidence-status', 'insufficient');
  await record.locator('summary').click();
  await expect(record).toContainText('仍缺少的依据');
  await expect(page.locator('.physical-location-detail')).not.toContainText('尚未完成具体连接用途调查');
});

test('冻结1.9仍按原数据读取，不补写本轮安装假设或工作状态', async ({ page }) => {
  test.skip(!historical, 'No immutable 1.9 release is registered.');
  test.setTimeout(360000);
  const response = await page.request.get(`/api/workspaces/${workspace.id}/snapshots/${historical.id}/view`, { timeout: 335000 });
  expect(response.ok()).toBe(true);
  const previous: PrototypeData = await response.json();
  expect(previous.analysis).not.toHaveProperty('installation_hypotheses');
  expect(previous.analysis).not.toHaveProperty('investigation_records');
  await page.goto('/#explorer?' + new URLSearchParams({ workspace: workspace.id, snapshot: historical.id, part: shell.id, detail: 'interfaces' }));
  await ready(page);
  await expect(page.locator('[data-installation-hypothesis-id]')).toHaveCount(0);
  await expect(page.locator('.snapshot-context-notice')).toContainText(data.meta.packageVersion);
  const originalWall = previous.analysis!.structure_candidates!.find(item => item.owner_ref === shell.id && item.geometry.type === 'cylinder')!;
  await page.goto('/#explorer?' + new URLSearchParams({ workspace: workspace.id, snapshot: historical.id, part: shell.id, detail: 'geometry', structure: originalWall.id }));
  await ready(page);
  const originalDetails = page.locator(`[data-structure-id="${originalWall.id}"]`);
  await expect(originalDetails).toHaveAttribute('data-work-status', 'not_recorded');
  await expect(originalDetails).toContainText('此历史快照未单独记录功能调查状态');
});
