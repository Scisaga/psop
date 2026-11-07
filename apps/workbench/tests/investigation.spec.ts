import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Quaternion, Vector3 } from 'three';
import { readRegistry, defaultRegistry } from '../scripts/dkp.mjs';
import type { PrototypeData, Vec3 } from '../src/types';

const registry = await readRegistry();
const workspace = registry.workspaces.find((item: { deviceId: string }) => item.deviceId === 'microduck');
if (!workspace?.snapshots.length) throw new Error('Prepare and register the Microduck workspace before testing investigations.');
const snapshotId = workspace.selectedSnapshotId || workspace.snapshots.at(-1).id;
const old18 = workspace.snapshots.find((item: { path: string }) => JSON.parse(readFileSync(path.resolve(path.dirname(defaultRegistry), item.path, 'manifest.json'), 'utf8')).profile === 'psop.hardware.source-model/1.8');
const review = JSON.parse(readFileSync(path.resolve(path.dirname(defaultRegistry), '../device-materials/interface-review/microduck-review.json'), 'utf8'));
let data: PrototypeData;
const url = (partId: string, query: Record<string, string> = {}, selected = snapshotId) => '/#explorer?' + new URLSearchParams({ workspace: workspace.id, snapshot: selected, part: partId, explode: '0', detail: 'geometry', ...query });

test.beforeAll(async () => {
  test.setTimeout(360000);
  const response = await fetch(`http://127.0.0.1:8780/api/workspaces/${workspace.id}/snapshots/${snapshotId}/view`, { signal: AbortSignal.timeout(330000) });
  if (!response.ok) throw new Error(await response.text());
  data = await response.json();
});

function independentlyAnnotated(id: string) {
  const sample = review.samples.find((item: { expected_features: { id: string }[] }) => item.expected_features.some(feature => feature.id === id));
  const expected = sample.expected_features.find((item: { id: string }) => item.id === id);
  const match = data.analysis!.review_coverage!.independent_features.matches.find(item => item.id === id && item.part_ref === sample.part_ref)!;
  expect(match, `Independent annotation ${id} must be located in the selected release`).toBeTruthy();
  const refs = match.candidate_refs as string[];
  const candidate = data.analysis!.structure_candidates!.find(item => refs.includes(item.id) && item.geometry.type === 'cylinder')!;
  expect(candidate, `${id} must retain its finite source wall`).toBeTruthy();
  expect(candidate.geometry_sha256).toBe(sample.geometry_sha256);
  expect(candidate.support_triangle_indices.some(triangle => expected.triangle_witnesses.includes(triangle))).toBe(true);
  const axis = new Vector3().fromArray(expected.axis_local);
  const delta = new Vector3().fromArray(candidate.geometry.center).sub(new Vector3().fromArray(expected.center_local_m));
  expect(delta.clone().cross(axis).length()).toBeLessThanOrEqual(expected.tolerance_m);
  expect(Math.abs(candidate.geometry.radius_m! - expected.radius_m)).toBeLessThanOrEqual(expected.tolerance_m);
  return { sample, expected, candidate };
}

test('独立标注的左外壳 LS-06 漏项可定位、查证、分享和导出，功能仍待证', async ({ page }, testInfo) => {
  test.skip(!data.analysis?.structure_candidates, 'Select the source-model/1.9 investigation release.');
  const { sample, expected, candidate } = independentlyAnnotated('LS-06');
  expect(candidate.function_status).toBe('unknown');
  expect(candidate.review_status).toBe('reviewed');
  await page.goto(url(sample.part_ref, { structure: candidate.id }));
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({ timeout: 30000 });
  const scene = page.locator('.scene-canvas');
  await expect(scene).toHaveAttribute('data-structure-highlight', candidate.id);
  await expect(scene).toHaveAttribute('data-geometry-authority', 'geometry_only');
  await expect(scene).toHaveAttribute('data-highlighted-triangles', String(candidate.support_triangle_indices.length));
  const details = page.locator(`[data-structure-id="${candidate.id}"]`);
  await expect(details).toHaveAttribute('data-review-status', 'reviewed');
  await expect(details).toHaveAttribute('data-function-status', 'unknown');
  await expect(details).toContainText('功能待证');
  await expect(details).toContainText('仍缺少的证据');
  await expect(details).toContainText('下一步调查');
  await expect(details).toContainText('本轮停止理由');
  await expect(details).toContainText('LS-06');
  await expect(page.locator('.object-id')).toContainText(sample.part_ref);
  const part = data.parts.find(item => item.id === sample.part_ref)!;
  const world = new Vector3().fromArray(expected.center_local_m).multiply(new Vector3().fromArray(part.scale)).applyQuaternion(new Quaternion().fromArray(part.quaternion)).add(new Vector3().fromArray(part.position));
  const axisWorld = new Vector3().fromArray(expected.axis_local).applyQuaternion(new Quaternion().fromArray(part.quaternion));
  await expect.poll(async () => {
    const center = (await scene.getAttribute('data-geometry-world-center'))?.split(',').map(Number) as Vec3 | undefined;
    return center ? new Vector3().fromArray(center).sub(world).cross(axisWorld).length() : Infinity;
  }).toBeLessThan(.0001);
  await details.locator('.mechanics-source-link').first().click();
  await expect(page.getByRole('dialog')).toContainText('left_shell');
  await page.keyboard.press('Escape');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出视图', exact: true }).click();
  const exported = JSON.parse(readFileSync((await (await downloading).path())!, 'utf8'));
  expect(exported.geometrySelection).toMatchObject({ kind: 'structure', id: candidate.id, ownerRef: sample.part_ref });
  expect(exported.snapshotId).toBe(snapshotId);
  expect(exported.packageDigest).toBe(data.meta.packageDigest);
  await page.reload();
  await expect(scene).toHaveAttribute('data-structure-highlight', candidate.id);
  await page.screenshot({ path: testInfo.outputPath('left-shell-ls06-workbench.png'), fullPage: true });
  writeFileSync(testInfo.outputPath('workbench-screenshot.json'), JSON.stringify({
    image: 'left-shell-ls06-workbench.png', snapshotId, packageId: data.meta.packageId,
    packageVersion: data.meta.packageVersion, packageDigest: data.meta.packageDigest,
    profile: data.meta.validation?.profile, independentAnnotationId: expected.id,
    partRef: sample.part_ref, structureRef: candidate.id, geometrySha256: sample.geometry_sha256,
    centerLocalM: expected.center_local_m, functionStatus: candidate.function_status,
    reviewStatus: candidate.review_status, scope: 'Published source geometry location and investigation record; no mechanical engagement or whole-device recall claim.',
  }, null, 2) + '\n');
});

test('另一类部件 LG-01 的独立壁截面也可定位，逐区域审查不随发现数自动完成', async ({ page }) => {
  test.skip(!data.analysis?.structure_candidates, 'Select the source-model/1.9 investigation release.');
  const { sample, candidate } = independentlyAnnotated('LG-01');
  await page.goto(url(sample.part_ref, { structure: candidate.id }));
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-structure-highlight', candidate.id);
  await expect(page.locator(`[data-structure-id="${candidate.id}"]`)).toContainText('下一步调查');
  const region = data.analysis!.review_regions!.find(item => item.owner_ref === sample.part_ref && item.review_status === 'auto_screened')!;
  await page.goto(url(sample.part_ref, { reviewRegion: region.id }));
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-review-region-highlight', region.id);
  await expect(page.locator(`[data-review-region-id="${region.id}"]`)).toContainText('仅自动初筛');
  await expect(page.locator(`[data-review-region-id="${region.id}"]`)).toContainText('自动初筛不代表');
  await page.goto('/#build?' + new URLSearchParams({ workspace: workspace.id, snapshot: snapshotId }));
  const coverage = page.locator('[data-review-coverage="published"]');
  await expect(coverage).toContainText('部分完成');
  await expect(coverage).toContainText(`${data.parts.length} / ${data.parts.length} 个实例`);
  await expect(coverage).toContainText('功能仍待证');
  await expect(coverage).toContainText('未标注结构');
  await expect(page.locator('.cap-snapshot-panel')).toContainText(data.meta.packageVersion);
});

test('部分圆柱壁保留角覆盖、拟合残差和方法边界，不补成完整孔', async ({ page }) => {
  test.skip(!data.analysis?.structure_candidates, 'Select the source-model/1.9 investigation release.');
  const shell = data.parts.find(item => item.meshKey === 'left_shell')!;
  const partial = data.analysis!.structure_candidates!.find(item => item.owner_ref === shell.id && Math.abs((item.geometry.radius_m ?? 0) - .0025) < .00002 && (item.measurement?.coverage ?? 1) < .95)!;
  expect(partial, 'Retain the measured partial wall in the source shell').toBeTruthy();
  await page.goto(url(shell.id, { structure: partial.id }));
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-structure-highlight', partial.id);
  const details = page.locator(`[data-structure-id="${partial.id}"]`);
  await expect(details.locator('[data-angular-coverage]')).toContainText(`${(partial.measurement!.coverage! * 100).toFixed(2)}%`);
  await expect(details).toContainText('不能据此认定完整孔或通孔');
  await expect(details).toContainText('最大拟合残差');
  await expect(details).toContainText('方法与适用边界');
  await expect(details).toContainText('不等于制造公差');
});

test('历史 1.8 快照仍按原合同浏览，不伪造新增调查状态', async ({ page }) => {
  test.setTimeout(360000);
  test.skip(!old18, 'A historical 1.8 snapshot is not registered.');
  const part = data.parts.find(item => item.meshKey === 'left_shell')!;
  await page.goto(url(part.id, {}, old18.id));
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({ timeout: 335000 });
  await expect(page.locator('.object-id')).toContainText(part.id);
  await expect(page.locator('[data-investigation-part]')).toHaveCount(0);
  await page.locator('[data-raw-geometry-records] > summary').click();
  await expect(page.getByRole('tab', { name: /^圆洞结构/ })).toBeVisible();
  await expect(page.locator('.geometry-record-list')).toContainText('有限截面轮廓');
  if (old18.id !== snapshotId && workspace.selectedSnapshotId === snapshotId) {
    await expect(page.locator('.snapshot-context-notice')).toContainText(data.meta.packageVersion);
    await page.getByRole('button', { name: '打开工作区当前版本', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`snapshot=${snapshotId}`));
    await expect(page.locator('.snapshot-context-notice')).toHaveCount(0);
  }
});
