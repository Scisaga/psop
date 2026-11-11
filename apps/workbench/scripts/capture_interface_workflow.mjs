/** Exercise writes only in a separate UI-check workspace registry. */
import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {activeDecisions} from './reference-decisions.mjs';

const origin=process.env.PSOP_CAPTURE_BASE_URL??'http://127.0.0.1:8781',workspace='microduck-ui-check';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),out=path.join(repo,'build/interface-workflow-review');
await fs.mkdir(out,{recursive:true});
async function read(url){const r=await fetch(origin+url);if(!r.ok)throw new Error(`${r.status}: ${url}`);return r.json();}
const catalog=await read('/api/workspaces'),w=catalog.workspaces.find(w=>w.id===workspace);
if(!w)throw new Error('A separate microduck-ui-check registry is required for write acceptance.');
const snapshot=w.selectedSnapshotId,base=`/api/workspaces/${workspace}/snapshots/${snapshot}`,data=await read(base+'/view');
const initialManifest=await read(base+'/manifest');
let ledger=await read(base+'/reference-decisions');
for(const event of activeDecisions(ledger)){
  const r=await fetch(origin+base+'/reference-decisions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'undo',decision_ref:event.id,expected_revision:ledger.revision})});
  if(!r.ok)throw new Error('Could not reset the UI-check workspace');ledger=await r.json();
}
const startRevision=ledger.revision;
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1500,height:1020},reducedMotion:'reduce'});
await page.addInitScript(()=>localStorage.setItem('psop.workbench.inspector-width','390'));
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const owner=id=>'part:microduck:'+id,iface=(id,key)=>`interface:assembly:${id}:${key}`;
const support='986b5adf27910138',lower='52fdcacf474a463f',jaw='50f0c376d01bb0c1',bearing='6b884b140f6e283c';
const mount=iface(support,'motor_support_mount'),lowerMount=iface(lower,'motor_support_mount'),relation='connection:assembly:'+support+':motor_support_mount';
const url=(part,extras={})=>origin+'/#explorer?'+new URLSearchParams({workspace,snapshot,part,labels:'0',explode:'0',...extras});
async function settled(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect(page.locator('.scene-canvas')).toHaveAttribute('data-camera-flight','settled',{timeout:15000});}
async function visit(part){await page.goto(url(part));await expect(page.locator('.object-id')).toContainText(part);await expect(page.locator('[data-scene-ready=true]')).toBeVisible({timeout:45000});await expect(page.locator('.capability-loading')).toHaveCount(0);}
async function original(){await page.getByRole('tab',{name:'原装配',exact:true}).click();}
async function select(ref){const active=page.locator(`[data-active-assembly-interface="${ref}"]`);if(!await active.count())await page.locator(`[data-assembly-interface="${ref}"] .assembly-interface-select`).click();await expect(active).toBeVisible();return active;}
async function shot(name){await settled();await page.screenshot({path:path.join(out,name+'.png')});}
const camera=()=>page.locator('.scene-canvas').getAttribute('data-camera-position');
function sameCamera(a,b){expect(Math.hypot(...a.split(',').map((v,i)=>Number(v)-Number(b.split(',')[i])))).toBeLessThan(1e-9);}
try{
  await visit(owner(support));
  await expect(page.locator('.capability-tabs [role=tab]')).toHaveText(['原装配','几何与能力','兼容']);
  await expect(page.getByRole('tab',{name:'原装配',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.getByText('当前查看推断修正配置中的参考连接',{exact:false})).toHaveCount(0);
  await expect(page.locator('button button')).toHaveCount(0);
  await settled();const before=await camera();
  await page.locator(`[data-assembly-interface="${mount}"] [data-reference-peer-link="${lowerMount}"]`).click();
  await expect(page.locator('.object-id')).toContainText(owner(lower));
  await expect(page.getByRole('tab',{name:'原装配',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator(`[data-active-assembly-interface="${lowerMount}"]`)).toBeVisible();await settled();sameCamera(await camera(),before);
  await page.getByRole('button',{name:'返回原接口',exact:true}).click();await expect(page.locator('.object-id')).toContainText(owner(support));
  await expect(page.locator(`[data-active-assembly-interface="${mount}"]`)).toBeVisible();
  const controls=()=>page.locator(`[data-reference-review="${relation}"]`);
  await controls().getByRole('button',{name:'确认原装配关系',exact:true}).click();
  await controls().getByLabel('确认依据或说明',{exact:true}).fill('界面回归验证：确认具体接口对应，不改变原始测量。');
  await controls().getByRole('button',{name:'保存确认',exact:true}).click();
  await expect(controls().locator('.reference-review-result')).toContainText('人工确认');
  await page.reload();await expect(page.locator('[data-scene-ready=true]')).toBeVisible({timeout:45000});
  await expect(controls()).toContainText('界面回归验证');
  ledger=await read(base+'/reference-decisions');expect(activeDecisions(ledger)).toHaveLength(1);
  await shot('manual-confirmation-persisted');
  await page.getByRole('button',{name:'查看原始位置',exact:true}).click();
  await expect(controls().getByRole('button',{name:'确认原装配关系',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'使用合理修正',exact:true}).click();await expect(controls().locator('.reference-review-result')).toContainText('人工确认');
  const exported=await read(base+'/reference-decisions/export');expect(exported.package_digest).toBe(data.meta.packageDigest);expect(activeDecisions(exported)).toHaveLength(1);
  await controls().getByRole('button',{name:'撤销人工判断',exact:true}).click();await expect(controls().getByRole('button',{name:'确认原装配关系',exact:true})).toBeVisible();
  await controls().getByRole('button',{name:'排除此对应',exact:true}).click();await controls().getByLabel('排除理由',{exact:true}).fill('界面回归验证：检查排除与撤销流程。');
  await controls().getByRole('button',{name:'保存排除',exact:true}).click();await expect(controls().locator('.reference-review-result')).toContainText('人工排除');
  await shot('manual-exclusion');await controls().getByRole('button',{name:'撤销人工判断',exact:true}).click();await expect(controls().getByRole('button',{name:'确认原装配关系',exact:true})).toBeVisible();
  console.log(JSON.stringify({stage:'manual-review',confirmation_persisted:true,configuration_isolated:true,exclusion_undone:true}));

  await visit(owner(bearing));await original();await select(iface(bearing,'outer_ring'));
  await page.getByRole('button',{name:'选择原装配对端',exact:true}).click();
  await page.getByLabel('对端部件',{exact:true}).selectOption(owner(support));
  await expect(page.getByLabel('对端接口',{exact:true})).toBeVisible();
  await page.getByLabel('对端接口',{exact:true}).selectOption(iface(support,'jaw_bearing_seat'));
  await page.locator('.reference-member-picker').nth(0).locator('summary').click();
  await page.locator('.reference-member-picker').nth(1).locator('summary').click();
  await page.locator('.reference-member-picker').nth(0).locator('input[type=checkbox]').first().check();
  await page.locator('.reference-member-picker').nth(1).locator('input[type=checkbox]').first().check();
  await page.getByLabel('对应关系说明',{exact:true}).fill('仅测试对端选择与成员保存，不表示实物装配结论。');
  await page.getByRole('button',{name:'保存为人工确认',exact:true}).click();
  await expect(page.locator('.reference-review-result')).toContainText('人工确认');
  ledger=await read(base+'/reference-decisions');const added=activeDecisions(ledger).find(e=>e.target.connection_ref===null);expect(added).toBeTruthy();expect(added.target.endpoints.every(e=>e.member_refs.length===1)).toBe(true);
  await shot('explicit-peer-selection');
  await page.getByRole('button',{name:'撤销人工判断',exact:true}).click();await expect(page.locator('.reference-review-result')).toHaveCount(0);

  await page.getByRole('tab',{name:'几何与能力',exact:true}).click();await visit(owner(jaw));
  await expect(page.getByRole('tab',{name:'几何与能力',exact:true})).toHaveAttribute('aria-selected','true');
  await visit(owner('07e507f1e9297aa3'));await page.getByRole('tab',{name:'兼容',exact:true}).click();
  await page.getByLabel('筛选兼容对端',{exact:true}).fill('电机支架');
  await page.locator('[data-compatibility-pair-row="pair:d5cf51f6df5344f5f634"]').click();
  await expect(page.locator('.capability-loading')).toHaveCount(0);
  const cylindrical=page.locator('[data-compatibility-candidate="compatibility:257d5715b21b017924aa9129"]');
  await expect(cylindrical).toContainText('4 组结构线索 · 6 次局部比较');
  await expect(cylindrical).toContainText('Ø18.5');await expect(cylindrical).toContainText('Ø19');await expect(cylindrical).toContainText('0.25 mm');
  await expect(page.getByText(/查看有限几何 \d/)).toHaveCount(0);
  await shot('compatibility-structure-comparison');
  await cylindrical.getByRole('button',{name:'继续查看 · 余 2 组结构线索',exact:true}).click();await expect(cylindrical.locator('[data-structure-comparison]')).toHaveCount(4);
  await page.locator('.compatibility-exploration > summary').click();await expect(page.locator('[data-compatibility-candidate]')).toHaveCount(5);
  await page.getByLabel('筛选连接方式',{exact:true}).selectOption('planar_seating');await expect(page.locator('[data-compatibility-candidate]')).toHaveCount(1);
  await page.getByLabel('筛选连接方式',{exact:true}).selectOption('');
  await expect(cylindrical).toBeVisible();await settled();const beforeInspect=await camera();
  await cylindrical.getByRole('button',{name:'查看对端',exact:true}).first().click();
  await expect(page.locator('.object-id')).toContainText(owner(support));await expect(page.getByRole('tab',{name:'几何与能力',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('button',{name:'返回这两个部件的兼容线索',exact:true})).toBeVisible();await settled();sameCamera(await camera(),beforeInspect);
  await page.getByRole('button',{name:'返回这两个部件的兼容线索',exact:true}).click();await expect(page.locator('[data-compatibility-pair="pair:d5cf51f6df5344f5f634"]')).toBeVisible();
  await expect(page.locator('.capability-loading')).toHaveCount(0);
  ledger=await read(base+'/reference-decisions');expect(activeDecisions(ledger)).toHaveLength(0);expect(ledger.revision-startRevision).toBe(6);
  expect(await read(base+'/manifest')).toEqual(initialManifest);expect(errors).toEqual([]);
  const report={schema:'psop.interface-workflow-ui-review/1',measured_at:new Date().toISOString(),workspace,snapshot,package_digest:data.meta.packageDigest,tab_order:['原装配','几何与能力','兼容'],default_tab:'原装配',
    checks:{direct_peer_and_return:true,no_camera_move_on_selection:true,confirmation_persists_after_reload:true,configuration_scoped:true,exclusion_and_undo:true,explicit_new_peer_and_members:true,export:true,geometry_tab_preserved:true,both_candidate_endpoints_readable:true,physical_resource_grouping:true,all_candidate_classes_reachable:true,return_to_candidate:true,source_manifest_unchanged:true},
    review_events_added:ledger.revision-startRevision,remaining_active_test_judgments:0,javascript_errors:errors};
  await fs.writeFile(path.join(out,'audit.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:true,...report}));
}finally{await browser.close();}
