import { test, expect, type Page } from '@playwright/test';
import { readRegistry } from '../scripts/dkp.mjs';
import type { PrototypeData } from '../src/types';

const registry = await readRegistry();
const workspace = registry.workspaces.find((item: { id: string }) => item.id === 'microduck');
const snapshot = workspace.selectedSnapshotId;
const hip = 'part:microduck:fa9ee2f71faafb88';
// These are the six source pairs reported at the baseline, independently of
// the new finding generator or its coverage totals.
const reviews = ['27d56794bd7c8a86', 'f81f10dc6482cb07', '926a5beb2c028185', 'c2e8a8093a4b8563', 'd22c650fc9abdaca', 'e42fab2d8700637e'].map(id => `connection-review:microduck:${id}`);
let data: PrototypeData;
test.beforeAll(async () => {
  test.setTimeout(360000);
  const response = await fetch(`http://127.0.0.1:8780/api/workspaces/microduck/snapshots/${snapshot}/view`);
  expect(response.ok).toBe(true);
  data = await response.json();
  expect(data.meta.validation?.profile).toBe('psop.hardware.source-model/1.11');
});
const url = (part: string, review?: string) => '/#explorer?' + new URLSearchParams({ workspace: 'microduck', snapshot, part, detail: 'interfaces', labels: '0', grid: '0', ...(review ? { review } : {}) });
async function ready(page: Page) {
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({ timeout: 335000 });
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-camera-flight', 'settled');
}

test('六对髋部审查公开逐项结论，正式安装与证据阶段保持分离', async ({ page }) => {
  await page.goto(url(hip));
  await ready(page);
  const inspector = page.locator('.inspector');
  await expect(inspector).toContainText('安装定义与参考配合');
  await expect(inspector).toContainText('此部件尚无已发布的安装定义');
  await expect(page.locator('.installation-analysis-disclosure')).toHaveCount(0);
  const findings = data.analysis!.connection_review_findings!;
  for (const id of reviews) {
    const finding = findings.find(item => item.review_ref === id)!;
    expect(finding, `The baseline pair ${id} must remain accounted for`).toBeTruthy();
    expect(finding.work_status).toBe('investigated');
    expect(finding.findings.length).toBeGreaterThan(0);
    expect(finding.actions.length).toBeGreaterThan(0);
    const card = page.locator(`[data-relation-finding="${finding.id}"]`);
    await expect(card).toContainText(finding.title);
    await expect(card).toContainText(finding.mechanism_candidates[0]?.summary || finding.findings[0]);
    await expect(card).toContainText(finding.missing_evidence[0]);
  }
  expect(data.analysis!.interface_connections ?? []).toEqual([]);
  expect(data.analysis!.mounting_interfaces!.filter(item => item.owner_ref === hip)).toEqual([]);
});

for (const id of reviews) test(`逐项连接审查 ${id.split(':').at(-1)} 保留实查内容、局部结构和双向定位`, async ({ page }) => {
  const finding = data.analysis!.connection_review_findings!.find(item => item.review_ref === id)!;
  await page.goto(url(hip, id));
  await ready(page);
  let detail = page.locator(`[data-connection-finding-id="${finding.id}"]`);
  await expect(detail).toContainText(finding.title);
  await expect(detail).toContainText(finding.findings[0]);
  await expect(detail).toContainText(finding.missing_evidence[0]);
  for (const role of ['location', 'retention', 'motion', 'limit']) {
    expect(finding.roles.some(item => item.role === role)).toBe(true);
    await expect(detail).toContainText(finding.roles.find(item => item.role === role)!.statement);
  }
  await expect(detail.locator('.relation-source-links > button').first()).toBeVisible();
  await detail.locator('.relation-source-links > button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  const peer = finding.participants.find(item => item.part_ref !== hip)!;
  await detail.locator(`[data-relation-participant="${peer.part_ref}"]`).click();
  await expect(page.locator('.object-id')).toContainText(peer.part_ref);
  detail = page.locator(`[data-connection-finding-id="${finding.id}"]`);
  await expect(detail.locator(`[data-relation-participant="${peer.part_ref}"]`)).toContainText('本件');
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-review-highlight', id);
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-inspection-active', 'true');
  await detail.locator(`[data-relation-participant="${hip}"]`).click();
  await expect(page.locator('.object-id')).toContainText(hip);
  await expect(detail).toContainText('下一步可执行调查');
});

test('知识查询与工作台分析内容一致，70个实例逐件有覆盖记录且保留既有三条假设', async ({ request }) => {
  const response = await request.get(`/api/workspaces/microduck/snapshots/${snapshot}/knowledge`);
  expect(response.ok()).toBe(true);
  const knowledge = await response.json();
  expect(knowledge.connection_review_findings).toEqual(data.analysis!.connection_review_findings);
  expect(knowledge.installation_hypotheses).toEqual(data.analysis!.installation_hypotheses);
  const parts = data.analysis!.connection_analysis_coverage!.parts.map(item => item.part_ref);
  expect([...parts].sort()).toEqual(data.parts.map(part => part.id).sort());
  expect(new Set(parts).size).toBe(70);
  for (const suffix of ['right-shell-neck-four', 'right-left-shell-closure', 'bearing-roll-housing-pair']) {
    expect(data.analysis!.installation_hypotheses!.some(item => item.id.endsWith(suffix))).toBe(true);
  }
});

test('无人工安装定义的左踝展示实查四孔机制，并从两端定位同一假设', async ({ page }) => {
  const ankle = 'part:microduck:07e507f1e9297aa3';
  const hypothesisId = 'installation-hypothesis:review-97e1e2f7a5a627de';
  const hypothesis = data.analysis!.installation_hypotheses!.find(item => item.id === hypothesisId)!;
  expect(data.analysis!.mounting_interfaces!.filter(item => item.owner_ref === ankle)).toEqual([]);
  expect(hypothesis.mechanism.kind).toBe('screw_clamp');
  await page.goto(url(ankle));
  await ready(page);
  let card = page.locator(`[data-installation-hypothesis-id="${hypothesisId}"]`);
  await expect(card).toContainText(hypothesis.mechanism.summary);
  await expect(card).toContainText('支持依据');
  const peer = hypothesis.participants.find(item => item.part_ref !== ankle)!;
  await card.locator(`[data-hypothesis-participant="${peer.part_ref}"]`).click();
  await expect(page.locator('.object-id')).toContainText(peer.part_ref);
  await ready(page);
  card = page.locator(`[data-installation-hypothesis-id="${hypothesisId}"]`);
  await expect(card).toContainText(hypothesis.mechanism.summary);
  await card.locator(`[data-hypothesis-participant="${ankle}"]`).click();
  await expect(page.locator('.object-id')).toContainText(ankle);
  await ready(page);
  await page.screenshot({ path: '../../build/stability-review/relations/after/left-ankle-hypothesis.png' });
});
