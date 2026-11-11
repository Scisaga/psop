import {test,expect} from '@playwright/test';

const base='/api/workspaces/capability-fixture/snapshots/revision/assets/';
const part=(id:string,name:string,x:number)=>({id,name,meshKey:id,body:'body',group:'torso',groupLabel:'躯干',kind:'structure',geometryUrl:base+`sources/${id}.stl`,position:[x,0,0],quaternion:[0,0,0,1],scale:[1,1,1],rgba:[.3,.7,.7,1],sourceIds:['source'],evidenceIds:[],locator:id});
const feature=(id:string,owner_ref:string,kind='bore_wall')=>({id,owner_ref,geometry_source_ref:'source',geometry_digest:'sha256:'+'a'.repeat(64),kind,geometry:{type:'cylinder',axis:[0,0,1],origin:[0,0,0],radius_m:.0011,axial_range_m:[0,.004],triangle_indices:[0]},capability:{basis:'geometric_potential',role:kind==='bore_wall'?'receiving_wall':'projecting_wall',template_refs:['mechanism:cylindrical_insertion:1'],resource_refs:[],member_selection:'finite_region_or_explicit_pattern',complementary_requirements:['Complementary material side and compatible finite radial profile'],unresolved_conditions:['Functional use, manufacturing fit, motion ownership, retaining and engineering conditions require their own evidence']}});
const pair={id:'pair-ab',owner_refs:['part-a','part-b'],path:'indexes/pairs/ab.json',candidate_count:1,template_counts:{'mechanism:cylindrical_insertion:1':1}};
const geometry=`solid fixture
facet normal 0 0 -1
outer loop
vertex 0 0 0
vertex 0 .01 0
vertex .01 0 0
endloop
endfacet
facet normal 0 -1 0
outer loop
vertex 0 0 0
vertex .01 0 0
vertex 0 0 .01
endloop
endfacet
facet normal -1 0 0
outer loop
vertex 0 0 0
vertex 0 0 .01
vertex 0 .01 0
endloop
endfacet
facet normal 1 1 1
outer loop
vertex .01 0 0
vertex 0 .01 0
vertex 0 0 .01
endloop
endfacet
endsolid fixture`;

test('完整几何独立于功能接口，候选详情按需加载并可查看对端',async({page})=>{
  const counts={sources:1,geometries:2,parts:2,bodies:1,joints:0,evidence:0};
  const snapshot={id:'revision',packageId:'fixture',packageVersion:'2.0.0-capabilities.test',packageDigest:'c'.repeat(64),ontologyVersion:'draft.4',createdAt:'2026-11-08T00:00:00Z',counts};
  const loaded:string[]=[];
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const data={meta:{inputKind:'dkp',dkpSchema:'psop.dkp/2.0-draft.1',packageId:snapshot.packageId,packageVersion:snapshot.packageVersion,packageDigest:snapshot.packageDigest,title:'几何能力样例',version:snapshot.packageVersion,snapshot:'revision',ontologyVersion:'draft.4',generatedAt:snapshot.createdAt,scope:'fixture',sourceCommit:'fixture',counts},parts:[part('part-a','样例外壳',0),part('part-b','样例轴',.025)],bodies:[{id:'body',name:'body',label:'样例结构',parent:null,position:[0,0,0],quaternion:[0,0,0,1],group:'torso',partIds:['part-a','part-b']}],joints:[],sources:[{id:'source',title:'样例原几何',path:'sources/part-a.stl',format:'stl',bytes:1,digest:'a'.repeat(64),scope:'model',url:base+'sources/part-a.stl'}],evidence:[],assembly:{features:[],interfaces:[],connections:[],part_notes:[],capability_index:{asset_base:base,parts:{'part-a':{path:base+'indexes/parts/a.json',feature_count:1,interface_count:0,candidate_count:1},'part-b':{path:base+'indexes/parts/b.json',feature_count:1,interface_count:0,candidate_count:1}},compatibility:{index_path:base+'indexes/compatibility.json'},review_path:base+'indexes/coverage.json'}}};
  const jsonAssets:Record<string,unknown>={
    'indexes/parts/a.json':{schema:'psop.part-capabilities/1',owner_ref:'part-a',features:[feature('orphan-bore','part-a')],interfaces:[],resources:[],frames:[],reference_connections:[],compatibility_pairs:[pair]},
    'indexes/parts/b.json':{schema:'psop.part-capabilities/1',owner_ref:'part-b',features:[feature('shaft','part-b','shaft_wall')],interfaces:[],resources:[],frames:[],reference_connections:[],compatibility_pairs:[pair]},
    'indexes/compatibility.json':{schema:'psop.compatibility-index/1',pairs:[pair],scope:{kind:'local_geometry'}},
    'indexes/pairs/ab.json':{schema:'psop.compatibility-pair/1',owner_refs:pair.owner_refs,candidates:[{id:'pin-bore',name:'轴与孔的几何适配',endpoints:[{owner_ref:'part-a',feature_refs:['orphan-bore']},{owner_ref:'part-b',feature_refs:['shaft']}],geometric_witness:{status:'conditional',diameter_m:.0022},unresolved_conditions:['保持方式待确认','source_coordinate_frame_does_not_prove_common_rigid_motion']}],screening:{owner_refs:pair.owner_refs,templates:[{template_ref:'mechanism:cylindrical_insertion:1',status:'candidate_emitted'}]}},
  };
  await page.route('**/api/workspaces**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/workspaces')return route.fulfill({json:{workspaces:[{id:'capability-fixture',deviceId:'fixture',name:'几何能力样例',description:'',selectedSnapshotId:'revision',snapshots:[snapshot]}]}});
    if(path.endsWith('/view'))return route.fulfill({json:data});
    if(path.startsWith(base)){
      const entry=path.slice(base.length);loaded.push(entry);
      if(entry.endsWith('.stl'))return route.fulfill({body:geometry,contentType:'model/stl'});
      if(entry in jsonAssets)return route.fulfill({json:jsonAssets[entry]});
    }
    return route.fulfill({status:404,json:{error:'Missing fixture asset'}});
  });
  await page.goto('/#explorer?workspace=capability-fixture&snapshot=revision&part=part-a');
  await expect(page.getByRole('tab',{name:'几何与能力',exact:true})).toBeVisible();
  await expect(page.locator('[data-capability-feature="orphan-bore"]')).toBeVisible();
  expect(loaded).toContain('indexes/parts/a.json');expect(loaded).not.toContain('indexes/parts/b.json');expect(loaded).not.toContain('indexes/pairs/ab.json');
  await page.getByRole('textbox',{name:'查找本件几何'}).fill('2.2');
  await page.locator('[data-capability-feature="orphan-bore"] > button').first().click();
  await expect(page.locator('[data-active-capability-feature="orphan-bore"]')).toContainText('用途和连接方式待确认');
  await expect(page.getByRole('region',{name:'本件几何潜能'})).toContainText('圆柱轴与孔的有限适配');
  await expect(page.getByRole('region',{name:'本件几何潜能'})).toContainText('内孔承接壁');
  await page.getByRole('button',{name:'定位本件几何',exact:true}).click();
  await expect(page).toHaveURL(/feature=orphan-bore/);
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-camera-flight','settled');
  await page.getByRole('tab',{name:'兼容候选',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'筛选兼容对端'})).toHaveValue('');
  await page.getByRole('tab',{name:'几何与能力',exact:true}).click();
  await page.getByRole('button',{name:'查找圆柱轴与孔的有限适配候选'}).click();
  await expect(page.getByRole('textbox',{name:'筛选兼容对端'})).toHaveValue('圆柱轴与孔的有限适配');
  await page.getByRole('textbox',{name:'筛选兼容对端'}).fill('样例轴');
  await page.locator('[data-compatibility-pair-row="pair-ab"]').click();
  await expect(page.locator('[data-compatibility-candidate="pin-bore"]')).toContainText('保持方式待确认');
  await expect(page.locator('[data-compatibility-candidate="pin-bore"]')).toContainText('源坐标框架不能证明这些区域始终共同刚性运动');
  await page.getByText('部件对检查记录',{exact:true}).click();
  await expect(page.locator('.capability-pair-detail')).toContainText('candidate_emitted');
  expect(loaded).toContain('indexes/pairs/ab.json');expect(loaded).not.toContain('indexes/parts/b.json');
  await page.locator('canvas.scene-webgl').evaluate(canvas=>canvas.setAttribute('data-capability-renderer','same-renderer'));
  const cameraBefore=await page.locator('.scene-canvas').evaluate(element=>({position:element.getAttribute('data-camera-position'),target:element.getAttribute('data-camera-target')}));
  await page.locator('.capability-candidate-ends > div').nth(1).getByRole('button').click();
  await expect(page.locator('.object-id')).toContainText('part-b');
  await expect(page.locator('[data-active-capability-feature="shaft"]')).toBeVisible();
  expect(loaded).toContain('indexes/parts/b.json');
  await expect(page.locator('canvas.scene-webgl')).toHaveAttribute('data-capability-renderer','same-renderer');
  const cameraAfter=await page.locator('.scene-canvas').evaluate(element=>({position:element.getAttribute('data-camera-position'),target:element.getAttribute('data-camera-target')}));
  for(const key of ['position','target'] as const){
    const before=cameraBefore[key]!.split(',').map(Number),after=cameraAfter[key]!.split(',').map(Number);
    expect(Math.hypot(...before.map((value,index)=>value-after[index]))).toBeLessThan(1e-10);
  }
  expect(loaded.filter(entry=>entry.endsWith('.stl'))).toHaveLength(2);
  expect(errors).toEqual([]);
});
