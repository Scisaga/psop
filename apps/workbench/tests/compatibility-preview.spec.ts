import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';

const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const out=path.resolve('../../build/interference-review/ui');
const owner='part:microduck:07e507f1e9297aa3',pairId='pair:84f78027ea6391334d78';
let snapshot:string;
test.use({reducedMotion:'reduce'});
test.beforeAll(async({request},testInfo)=>{
  testInfo.setTimeout(300000);
  const catalog=await(await request.get('/api/workspaces')).json(),workspace=catalog.workspaces.find((w:{id:string})=>w.id==='microduck');
  expect(workspace).toBeTruthy();snapshot=workspace.selectedSnapshotId;await fs.mkdir(out,{recursive:true});
  expect((await request.get(`/api/workspaces/microduck/snapshots/${snapshot}/view`,{timeout:300000})).ok()).toBeTruthy();
});
async function settled(page:Page){await expect(page.locator('.scene-canvas')).toHaveAttribute('data-camera-flight','settled');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function openPair(page:Page,id=pairId){
  await page.addInitScript(()=>localStorage.setItem('psop.workbench.inspector-width','390'));
  await page.goto('/#explorer?'+new URLSearchParams({workspace:'microduck',snapshot,part:owner,labels:'0',explode:'0.46',camera:'0.1799421,0.3237751,0.1894222,0.0202565,0,0.1454614'}));
  await expect(page.locator('[data-scene-ready=true]')).toBeVisible({timeout:45000});
  await page.getByRole('tab',{name:'兼容',exact:true}).click();await page.getByLabel('筛选兼容对端',{exact:true}).fill(id===pairId?'颈部':'电机支架');
  await page.locator(`[data-compatibility-pair-row="${id}"]`).click();await expect(page.locator('.capability-loading')).toHaveCount(0);await settled(page);
}
const camera=(page:Page)=>page.locator('.scene-canvas').evaluate(e=>[e.getAttribute('data-camera-position'),e.getAttribute('data-camera-target')]);
function sameCamera(before:(string|null)[],after:(string|null)[]){for(let k=0;k<2;k++){const a=before[k]!.split(',').map(Number),b=after[k]!.split(',').map(Number);expect(Math.hypot(...a.map((n,i)=>n-b[i]))).toBeLessThan(1e-9);}}
function coloredModelPixels(buffer:Buffer){const png=PNG.sync.read(buffer);let count=0;for(let y=100;y<png.height-90;y++)for(let x=20;x<png.width-20;x++){const i=(y*png.width+x)*4,[r,g,b]=png.data.subarray(i,i+3);if(b>r+10&&g>r+8&&b>130)count++;}return count;}

test('真实四孔接口的间距、整组装配动画、透视及整机恢复',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await openPair(page);
  const canvas=page.locator('.scene-canvas'),structures=page.locator('.compatibility-method[open] > .compatibility-structure');
  const before=await camera(page);await page.locator('canvas.scene-webgl').evaluate(e=>e.setAttribute('data-preview-renderer','original'));
  const tabBox=await page.locator('.inspector-tabs').boundingBox(),backBox=await page.getByRole('button',{name:'返回部件对',exact:true}).boundingBox();
  expect(backBox!.y-tabBox!.y-tabBox!.height).toBeGreaterThanOrEqual(16);
  await expect(structures).toHaveCount(2);await expect(structures.first()).toHaveAttribute('data-matched-member-count','4');await expect(structures.first().locator('.compatibility-measurements')).not.toHaveAttribute('open','');
  await expect(structures.first().locator('dl').first()).toBeHidden();await page.screenshot({path:path.join(out,'compact-details.png')});
  await structures.first().locator('.compatibility-structure-actions button').click();
  await expect(canvas).toHaveAttribute('data-compatibility-preview-active','true');await settled(page);
  await expect(canvas).toHaveAttribute('data-compatibility-preview-progress','0.0000');
  await expect(page.locator('.explosion-dock')).toBeHidden();await expect(page.getByRole('region',{name:'当前装配示意'})).toContainText('固定姿态已检查整件干涉');await expect(canvas).toHaveAttribute('data-compatibility-preview-member-count','4');
  await page.screenshot({path:path.join(out,'separated.png')});
  await page.getByRole('button',{name:'对位',exact:true}).click();await expect(canvas).toHaveAttribute('data-compatibility-preview-progress','1.0000');
  await page.screenshot({path:path.join(out,'aligned.png')});
  const normalPixels=coloredModelPixels(await canvas.screenshot());expect(normalPixels).toBeGreaterThan(1500);
  await page.getByLabel('透视结构',{exact:true}).check();
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const transparentPixels=coloredModelPixels(await canvas.screenshot());expect(transparentPixels).toBeGreaterThan(500);
  await page.screenshot({path:path.join(out,'transparent.png')});
  await page.getByLabel('透视结构',{exact:true}).uncheck();
  await page.getByRole('button',{name:'重播装配示意',exact:true}).click();await expect(canvas).toHaveAttribute('data-compatibility-preview-playing','true');
  await expect.poll(async()=>Number(await canvas.getAttribute('data-compatibility-preview-progress'))).toBeGreaterThan(.04);
  await page.getByRole('button',{name:'暂停装配示意',exact:true}).click();await expect(canvas).toHaveAttribute('data-compatibility-preview-playing','false');const paused=await canvas.getAttribute('data-compatibility-preview-progress');
  await page.waitForTimeout(180);await expect(canvas).toHaveAttribute('data-compatibility-preview-progress',paused!);
  const slider=page.getByLabel('装配示意进度',{exact:true});await slider.press('Home');await slider.press('ArrowRight');await expect(canvas).toHaveAttribute('data-compatibility-preview-progress','0.0100');
  const track=await slider.boundingBox();await page.mouse.click(track!.x+track!.width*.7,track!.y+track!.height/2);await expect.poll(async()=>Number(await canvas.getAttribute('data-compatibility-preview-progress'))).toBeGreaterThan(.6);
  const features=await canvas.getAttribute('data-compatibility-preview-features');
  await structures.nth(1).locator('.compatibility-structure-actions button').click();await expect.poll(()=>canvas.getAttribute('data-compatibility-preview-features')).not.toBe(features);
  await expect(page.locator('.compatibility-structure-actions button[aria-pressed=true]')).toHaveCount(1);await expect(page.getByLabel('透视结构',{exact:true})).not.toBeChecked();
  await page.getByRole('button',{name:'返回整机',exact:true}).click();await expect(canvas).toHaveAttribute('data-compatibility-preview-active','false');await settled(page);
  sameCamera(before,await camera(page));await expect(page.getByLabel('爆炸展开程度',{exact:true})).toHaveValue('46');
  await expect(page.locator('canvas.scene-webgl')).toHaveAttribute('data-preview-renderer','original');
  await page.screenshot({path:path.join(out,'restored.png')});
  await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({snapshot,pairId,spacing:backBox!.y-tabBox!.y-tabBox!.height,normalPixels,transparentPixels,cameraRestored:true,sourceRendererPreserved:true,errors},null,2));
  expect(errors).toEqual([]);
});

test('完整接口的筛选、对端导航和返回列表会关闭预览',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await openPair(page);
  const canvas=page.locator('.scene-canvas'),structure=page.locator('.compatibility-method[open] > .compatibility-structure').first();
  await structure.locator('.compatibility-structure-actions button').click();await expect(canvas).toHaveAttribute('data-compatibility-preview-active','true');await settled(page);
  await page.getByRole('button',{name:'对位',exact:true}).click();await expect(canvas).toHaveAttribute('data-compatibility-preview-progress','1.0000');
  await structure.locator('.compatibility-measurements > summary').click();await structure.getByRole('button',{name:'查看对端接口',exact:true}).click();
  await expect(page.getByRole('tab',{name:'原装配',exact:true})).toHaveAttribute('aria-selected','true');await expect(canvas).toHaveAttribute('data-compatibility-preview-active','false');
  await expect(page.locator('[data-active-assembly-interface]')).toContainText('四孔');
  await page.getByRole('tab',{name:'兼容',exact:true}).click();await expect(page.locator('.capability-loading')).toHaveCount(0);
  await expect(page.getByLabel('筛选连接方式',{exact:true}).locator('option')).not.toContainText(['承托与接触面']);
  await page.getByLabel('筛选连接方式',{exact:true}).selectOption('screw_reception');
  const method=page.locator('.compatibility-method');if(await method.getAttribute('open')===null)await method.locator(':scope > summary').click();
  await method.getByRole('button',{name:'整组装配示意',exact:true}).first().click();
  await expect(canvas).toHaveAttribute('data-compatibility-preview-active','true');await settled(page);
  await page.getByLabel('筛选连接方式',{exact:true}).selectOption('');await expect(canvas).toHaveAttribute('data-compatibility-preview-active','false');
  await page.locator('.compatibility-structure-actions button').first().click();await expect(canvas).toHaveAttribute('data-compatibility-preview-active','true');
  await page.getByRole('button',{name:'返回部件对',exact:true}).click();await expect(canvas).toHaveAttribute('data-compatibility-preview-active','false');await expect(page.getByLabel('筛选兼容对端',{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('连接目录打开示意并完成播放，窄窗口可操作',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/#connections?'+new URLSearchParams({workspace:'microduck',snapshot,part:owner,explode:'0',labels:'0'}));
  await page.getByLabel('查找兼容候选',{exact:true}).fill('左踝部件');
  const row=page.locator(`[data-compatibility-pair-row="${pairId}"]`);
  // The directory is bounded; retain its existing pagination when looking up
  // a pair that is later than the first page of matching counterparts.
  while(!await row.count())await page.getByRole('button',{name:/继续查看 · 余 .* 对/}).click();
  await row.click();await page.locator('.compatibility-structure-actions button').first().click();
  await expect(page).toHaveURL(/#explorer\?/);const canvas=page.locator('.scene-canvas');
  await expect(canvas).toHaveAttribute('data-compatibility-preview-active','true',{timeout:45000});await settled(page);
  await expect(canvas).toHaveAttribute('data-compatibility-preview-playing','true');
  await expect(canvas).toHaveAttribute('data-compatibility-preview-progress','1.0000',{timeout:15000});
  await expect(page.getByRole('button',{name:'重播装配示意',exact:true})).toBeVisible();
  await page.setViewportSize({width:1050,height:850});await settled(page);await page.screenshot({path:path.join(out,'narrow-preview.png')});
  const viewport=await page.locator('.viewport').boundingBox(),controls=await page.getByRole('region',{name:'装配示意播放控制'}).boundingBox();
  expect(controls!.x).toBeGreaterThanOrEqual(viewport!.x);expect(controls!.x+controls!.width).toBeLessThanOrEqual(viewport!.x+viewport!.width);
  const heading=await page.getByRole('region',{name:'当前装配示意'}).boundingBox(),viewSelector=await page.locator('.view-selector').boundingBox();
  expect(heading!.x+heading!.width).toBeLessThan(viewSelector!.x);
  await page.getByRole('button',{name:'返回整机',exact:true}).click();await expect(canvas).toHaveAttribute('data-compatibility-preview-active','false');
  expect(errors).toEqual([]);
});

test('旧视图链接进入修正版本并保留对象和相机',async({page})=>{
  const originalCamera='0.1799421,0.3237751,0.1894222,0.0202565,0,0.1454614';
  await page.goto('/#explorer?'+new URLSearchParams({workspace:'microduck',snapshot:'dkp-2222613002e674936348',part:owner,camera:originalCamera,explode:'0',labels:'0'}));
  await expect(page.locator('[data-scene-ready=true]')).toBeVisible();await settled(page);
  await expect(page).toHaveURL(new RegExp('snapshot='+snapshot));await expect(page.locator('.object-id')).toContainText(owner);
  sameCamera([originalCamera.split(',').slice(0,3).join(','),originalCamera.split(',').slice(3).join(',')],await camera(page));
  await fs.writeFile(path.join(out,'retired-link-recovery.json'),JSON.stringify({requested_snapshot:'dkp-2222613002e674936348',active_snapshot:snapshot,part:owner,camera:await camera(page),recovered:true},null,2));
});

test('兼容目录排除孤立线索，已声明的相邻双孔仍按双孔演示',async({page,request})=>{
  const root=path.resolve('../../build/microduck/source-1.15/microduck-capabilities-9.dkp');
  const read=async(relative:string)=>{const raw=await fs.readFile(path.join(root,relative));return JSON.parse((relative.endsWith('.gz')?gunzipSync(raw):raw).toString('utf8'));};
  const index=await read('indexes/compatibility.json'),scene=await read('indexes/scene.json'),coverage=(await read('indexes/coverage.json')).candidate_coverage;
  const compatibleCount=index.pairs.filter((p:{candidate_count:number})=>p.candidate_count>0).length;
  expect(index.pairs).toHaveLength(2415);expect(compatibleCount).toBe(coverage.compatible_owner_pair_count);expect(compatibleCount).toBeLessThan(755);
  const localOnly=index.pairs.find((p:{id:string})=>p.id==='pair:d5cf51f6df5344f5f634');expect(localOnly.candidate_count).toBe(0);expect(localOnly.local_geometry_count).toBeGreaterThan(0);
  const localDetail=await read(localOnly.path);expect(localDetail.candidates).toHaveLength(0);expect(localDetail.local_geometry_clues.length).toBeGreaterThan(0);
  await page.goto('/#connections?'+new URLSearchParams({workspace:'microduck',snapshot}));await expect(page.locator('.capability-count')).toHaveText(`${compatibleCount} 个含候选的部件对`);
  let example:any;
  for(const pair of index.pairs.filter((p:{candidate_count:number})=>p.candidate_count>0)){
    const detail=await read(pair.path),candidate=detail.candidates.find((c:{template_ref:string})=>c.template_ref.includes('through_fastener'));
    const match=candidate?.interface_matches?.toSorted((a:any,b:any)=>b.member_count-a.member_count||a.id.localeCompare(b.id))[0];
    if(match?.member_count===2&&(match.selection_a==='adjacent_pair'||match.selection_b==='adjacent_pair')){example={pair,match};break;}
  }
  expect(example).toBeTruthy();
  const peer=scene.parts.find((p:{id:string})=>p.id===example.pair.owner_refs[1]);
  await page.goto('/#explorer?'+new URLSearchParams({workspace:'microduck',snapshot,part:example.pair.owner_refs[0],labels:'0',explode:'0'}));
  await expect(page.locator('[data-scene-ready=true]')).toBeVisible();await page.getByRole('tab',{name:'兼容',exact:true}).click();await page.getByLabel('筛选兼容对端',{exact:true}).fill(peer.name);
  await page.locator(`[data-compatibility-pair-row="${example.pair.id}"]`).click();await page.getByLabel('筛选连接方式',{exact:true}).selectOption('through_fastener');
  const method=page.locator('.compatibility-method');if(await method.getAttribute('open')===null)await method.locator(':scope > summary').click();
  const item=method.locator('[data-interface-match]').first();await expect(item).toHaveAttribute('data-matched-member-count','2');await expect(item).toContainText('相邻双孔');
  await item.getByRole('button',{name:'整组装配示意',exact:true}).click();await expect(page.locator('.scene-canvas')).toHaveAttribute('data-compatibility-preview-member-count','2');await settled(page);
  await page.getByRole('button',{name:'对位',exact:true}).click();await expect(page.getByRole('region',{name:'当前装配示意'})).toContainText('固定姿态已检查整件干涉');await page.screenshot({path:path.join(out,'adjacent-two-hole.png')});
  expect((await request.get('/api/workspaces')).ok()).toBeTruthy();
});

test('腿部连杆与舵机排除穿透双孔，四孔示意使用已检查的贴合终点',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const leg='part:microduck:638f29b46b322e64',motor='part:microduck:a682dc3620df43f5',id='pair:4b913c61038bb4bd5b37';
  await page.addInitScript(()=>localStorage.setItem('psop.workbench.inspector-width','390'));
  await page.goto('/#explorer?'+new URLSearchParams({workspace:'microduck',snapshot,part:motor,labels:'0',explode:'0'}));
  await expect(page.locator('[data-scene-ready=true]')).toBeVisible();await page.getByRole('tab',{name:'兼容',exact:true}).click();await page.getByLabel('筛选兼容对端',{exact:true}).fill('腿部连杆');
  await page.locator(`[data-compatibility-pair-row="${id}"]`).click();await expect(page.locator('.capability-loading')).toHaveCount(0);
  const cards=page.locator('.compatibility-method[open] > [data-interface-match]');await expect(cards).toHaveCount(2);
  for(const card of await cards.all())await expect(card).toHaveAttribute('data-matched-member-count','4');
  await expect(page.locator('.capability-pair-detail')).not.toContainText('2/2 孔位匹配');
  await cards.first().getByRole('button',{name:'整组装配示意',exact:true}).click();
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-compatibility-preview-member-count','4');await settled(page);
  await page.getByRole('button',{name:'对位',exact:true}).click();await expect(page.locator('.scene-canvas')).toHaveAttribute('data-compatibility-preview-progress','1.0000');
  await expect(page.getByRole('region',{name:'当前装配示意'})).toContainText('固定姿态已检查整件干涉');
  await page.screenshot({path:path.join(out,'leg-motor-checked-aligned.png')});
  await page.getByLabel('透视结构',{exact:true}).check();await page.screenshot({path:path.join(out,'leg-motor-checked-transparent.png')});
  await page.getByRole('button',{name:'返回整机',exact:true}).click();await expect(page.locator('.scene-canvas')).toHaveAttribute('data-compatibility-preview-active','false');
  expect(errors).toEqual([]);await fs.writeFile(path.join(out,'leg-motor-check.json'),JSON.stringify({snapshot,owners:[leg,motor],pair:id,onlyFourHole:true,errors},null,2));
});
