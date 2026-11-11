/** Read-only acceptance of the published source and reconciled configurations. */
import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.join(repo,'build/reference-alignment-review');
const origin=process.env.PSOP_CAPTURE_BASE_URL||'http://127.0.0.1:8780';
async function read(url){const r=await fetch(new URL(url,origin));if(!r.ok)throw new Error(`${r.status}: ${url}`);return r.json();}
const registry=await read('/api/workspaces');
const workspace=registry.workspaces.find(w=>w.id==='microduck');
const snapshot=workspace.selectedSnapshotId;
const data=await read(`/api/workspaces/microduck/snapshots/${snapshot}/view`);
const alignment=data.reference_alignment;
expect(alignment.placements).toHaveLength(2);
const report=await read(data.assembly.capability_index.asset_base+alignment.path);
expect(report.actions).toHaveLength(1);
expect(report.actions[0].constraints).toHaveLength(13);
expect(report.actions[0].constraints.every(c=>c.passed)).toBe(true);
expect(report.geometry_modified).toBe(false);
for(const p of alignment.placements){
  expect(data.parts.find(part=>part.id===p.part_ref).position).toEqual(p.source_position);
  expect(p.position[2]-p.source_position[2]).toBeCloseTo(-.0002,8);
}
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>localStorage.setItem('psop.workbench.inspector-width','410'));
const url=owner=>origin+'/#explorer?'+new URLSearchParams({workspace:'microduck',snapshot,part:owner,labels:'0',explode:'0'});
const coordinates=()=>page.locator('.coordinate-row strong').allTextContents();
const rows=[];
try{
  for(const placement of alignment.placements){
    await page.goto(url(placement.part_ref));
    await expect(page.locator('.object-id')).toContainText(placement.part_ref);
    await expect(page.locator('[data-scene-ready=true]')).toBeVisible({timeout:45000});
    await expect(page.locator('.viewport-context')).toHaveAttribute('data-reference-configuration',alignment.configuration_ref);
    await page.getByLabel('对象详情分类').selectOption('overview');
    await expect(page.locator('.coordinate-row strong')).toHaveText(placement.position.map(v=>(v*1000).toFixed(2)));
    const corrected=await coordinates();
    await page.getByRole('button',{name:'查看原始位置',exact:true}).click();
    await expect(page.locator('[data-scene-ready=true]')).toBeVisible({timeout:45000});
    await expect(page.locator('.viewport-context')).toHaveAttribute('data-reference-configuration',alignment.source_configuration_ref);
    await expect(page.locator('.coordinate-row strong')).toHaveText(placement.source_position.map(v=>(v*1000).toFixed(2)));
    const source=await coordinates();
    await page.getByRole('button',{name:'使用合理修正',exact:true}).click();
    await expect(page.locator('[data-scene-ready=true]')).toBeVisible({timeout:45000});
    await expect(page.locator('.coordinate-row strong')).toHaveText(corrected);
    rows.push({part_ref:placement.part_ref,source_mm:source,corrected_mm:corrected});
  }
  const bearing='part:microduck:a0775b54397eb21e';
  await page.goto(url(bearing));
  await expect(page.locator('[data-scene-ready=true]')).toBeVisible({timeout:45000});
  await page.getByRole('tab',{name:'原装配',exact:true}).click();
  const inner=page.locator('[data-assembly-interface="interface:assembly:a0775b54397eb21e:inner_ring"]');
  const outer=page.locator('[data-assembly-interface="interface:assembly:a0775b54397eb21e:outer_ring"]');
  await expect(inner).toContainText('喙部件');
  await expect(outer).toContainText('头部下壳');
  await expect(outer).toContainText('电机支架');
  await expect(outer).not.toContainText('待确认');
  await page.screenshot({path:path.join(out,'corrected-bearing-interfaces.png')});
  await inner.locator('.assembly-interface-select').click();
  await expect(page.locator('.assembly-mechanism')).toContainText('装配声明');
  await expect(page.locator('[data-active-assembly-interface]')).toContainText('修正参考配置中有限配合区已对中');
  await expect(page.locator('.assembly-incompatible')).toHaveCount(0);
  const correctedText=await page.locator('[data-active-assembly-interface]').innerText();
  await page.screenshot({path:path.join(out,'corrected-journal-fit.png')});
  await page.getByRole('button',{name:'查看原始位置',exact:true}).click();
  await expect(page.locator('[data-scene-ready=true]')).toBeVisible({timeout:45000});
  await expect(page.locator('[data-active-assembly-interface]')).toContainText('0.2 mm');
  await expect(page.locator('[data-active-assembly-interface]')).not.toContainText('修正参考配置中有限配合区已对中');
  const sourceText=await page.locator('[data-active-assembly-interface]').innerText();
  await page.screenshot({path:path.join(out,'original-source-conflict.png')});
  await page.getByRole('button',{name:'使用合理修正',exact:true}).click();
  await expect(page.locator('.assembly-incompatible')).toHaveCount(0);
  await page.getByRole('button',{name:'本件接口',exact:true}).click();
  await outer.locator('.assembly-interface-select').click();
  await expect(page.locator('.assembly-mechanism').filter({hasText:'修正配置下的推断配合'})).toHaveCount(2);
  for(const id of ['ea69e2c6bba10a23','55121c0b36f62219']){
    await page.goto(url('part:microduck:'+id));
    await expect(page.locator('[data-scene-ready=true]')).toBeVisible({timeout:45000});
    await page.getByRole('tab',{name:'原装配',exact:true}).click();
    await page.locator(`[data-assembly-interface="interface:assembly:${id}:outer_ring"] .assembly-interface-select`).click();
    await expect(page.locator('.assembly-mechanism')).toContainText('修正配置下的推断配合');
    await expect(page.locator('.assembly-incompatible')).toHaveCount(0);
    await page.getByRole('button',{name:'查看原始位置',exact:true}).click();
    await expect(page.locator('.assembly-incompatible')).toContainText('0.2');
    await page.getByRole('button',{name:'使用合理修正',exact:true}).click();
    await expect(page.locator('.assembly-incompatible')).toHaveCount(0);
  }
  await page.getByRole('button',{name:'修正依据',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('参考装配合理修正依据与有限约束');
  await expect(page.getByRole('dialog')).toContainText(alignment.title);
  await expect(page.getByRole('dialog')).toContainText('reference-adjustments');
  await page.screenshot({path:path.join(out,'repair-provenance.png')});
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
  const audit={schema:'psop.reference-alignment-ui-review/1',measured_at:new Date().toISOString(),snapshot,
    version:data.meta.packageVersion,package_digest:data.meta.packageDigest,placements:rows,
    passed_constraint_count:report.actions[0].constraints.length,corrected_text:correctedText,source_text:sourceText,
    javascript_errors:errors,scope:report.validation_scope};
  await fs.writeFile(path.join(out,'audit.json'),JSON.stringify(audit,null,2)+'\n');
  console.log(JSON.stringify({ok:true,snapshot,version:audit.version,moved_parts:rows.length,passed_checks:audit.passed_constraint_count,javascript_errors:errors.length}));
}finally{await browser.close();}
