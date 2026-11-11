/** Read-only UI acceptance and measurements for explicitly registered snapshots. */
import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const args=process.argv.slice(2),option=(name,fallback)=>{const index=args.indexOf(name);return index<0?fallback:args[index+1];};
const origin=process.env.PSOP_CAPTURE_BASE_URL||'http://127.0.0.1:8780';
const out=path.resolve(option('--out',path.join(repo,'.runtime/capability-ui-review')));await fs.mkdir(out,{recursive:true});
async function json(url){const started=performance.now(),response=await fetch(new URL(url,origin));if(!response.ok)throw new Error(`${response.status}: ${url}`);const text=await response.text();return {data:JSON.parse(text),elapsed_ms:performance.now()-started,decoded_bytes:Buffer.byteLength(text),encoded_bytes:Number(response.headers.get('content-length')||0)};}
const catalog=(await json('/api/workspaces')).data;
const workspace=catalog.workspaces.find(item=>item.id===option('--workspace','microduck'));
if(!workspace)throw new Error('The requested workspace is not registered.');
const before=option('--before',workspace.snapshots[0]?.id),after=option('--after',workspace.selectedSnapshotId);
if(!before||!after||before===after)throw new Error('Supply two distinct registered snapshots using --before and --after.');
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
function distance(a,b){return Math.hypot(...a.map((value,index)=>value-b[index]));}
async function camera(page){return page.locator('.scene-canvas').evaluate(element=>({position:element.dataset.cameraPosition?.split(',').map(Number),target:element.dataset.cameraTarget?.split(',').map(Number)}));}
async function settled(page){await expect(page.locator('.scene-canvas')).toHaveAttribute('data-camera-flight','settled',{timeout:15000});}
async function idle(page){await settled(page);await page.waitForTimeout(300);const a=Number(await page.locator('.scene-canvas').getAttribute('data-render-count'));await page.waitForTimeout(1000);return Number(await page.locator('.scene-canvas').getAttribute('data-render-count'))-a;}
try{
 for(const [label,snapshot] of [['before',before],['after',after]]){
  const api=`/api/workspaces/${workspace.id}/snapshots/${snapshot}/view`,first=await json(api),data=first.data;
  const owner=data.parts.find(part=>part.meshKey==='left_shell');if(!owner)throw new Error('The Microduck left shell sample is missing.');
  const context=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
  await page.addInitScript(()=>localStorage.setItem('psop.workbench.inspector-width','360'));
  const network=[],pending=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.url().includes('/api/'))pending.push(response.allHeaders().then(headers=>network.push({path:new URL(response.url()).pathname,status:response.status(),encoded_bytes:Number(headers['content-length']||0),encoding:headers['content-encoding']||'identity'})));});
  const started=performance.now();await page.goto(origin+'/#explorer?'+new URLSearchParams({workspace:workspace.id,snapshot,part:owner.id,labels:'0',explode:'0'}));
  await expect(page.locator('[data-scene-ready=true]')).toBeVisible({timeout:335000});await settled(page);
  const modelReadyMs=performance.now()-started;
  let geometryReadyMs=null;
  if(data.assembly?.capability_index){await expect(page.locator('[data-capability-feature]').first()).toBeVisible({timeout:30000});geometryReadyMs=performance.now()-started;}
  const result={label,snapshot,version:data.meta.packageVersion,digest:data.meta.packageDigest,profile:data.meta.validation?.profile,api_first_read_ms:first.elapsed_ms,view_json_decoded_bytes:first.decoded_bytes,ui_model_ready_ms:modelReadyMs,ui_part_geometry_ready_ms:geometryReadyMs,idle_renders_per_second:await idle(page),selected_part:owner.id};
  if(result.idle_renders_per_second>2)throw new Error(`${label} continued rendering while settled and idle.`);
  await page.screenshot({path:path.join(out,label+'-overview.png')});
  if(data.assembly?.capability_index){
    const detailRead=await json(data.assembly.capability_index.parts[owner.id].path),detail=detailRead.data;
    result.part_detail={encoded_bytes:detailRead.encoded_bytes,decoded_bytes:detailRead.decoded_bytes,feature_count:detail.features.length};
    const holes=[.0011,.0025].map(radius=>detail.features.find(feature=>{const g=feature.geometry;return feature.basis==='mesh_measurement'&&feature.candidate_eligible!==false&&feature.measurement?.method&&feature.kind==='bore_wall'&&g.type==='cylinder'&&Math.abs(g.axis[2])>.9999&&Math.abs(g.origin[0]-.0255)<1e-6&&Math.abs(g.origin[1]+.0095)<1e-6&&Math.abs(g.radius_m-radius)<1e-6;}));
    if(holes.some(hole=>!hole))throw new Error('Independent left-shell vertical stepped-bore sample is missing.');
    result.vertical_holes=[];
    for(const hole of holes){
      await page.getByRole('textbox',{name:'查找本件几何'}).fill(hole.id);const initial=await camera(page);
      await page.locator(`[data-capability-feature="${hole.id}"] > button`).first().click();await expect(page.locator('.scene-canvas')).toHaveAttribute('data-selected-features',hole.id);
      const selected=await camera(page);if(distance(initial.position,selected.position)>1e-10||distance(initial.target,selected.target)>1e-10)throw new Error('Ordinary geometry selection moved the camera.');
      const focusStart=performance.now();await page.getByRole('button',{name:'定位本件几何',exact:true}).click();
      await expect.poll(async()=>distance(initial.position,(await camera(page)).position),{timeout:15000}).toBeGreaterThan(1e-8);await settled(page);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const visibleSamples=Number(await page.locator('.scene-canvas').getAttribute('data-focus-visible-source-samples')),sampleCount=Number(await page.locator('.scene-canvas').getAttribute('data-focus-source-sample-count'));
      if(!visibleSamples||!sampleCount)throw new Error('The settled explicit focus has no visible selected source-facet witness.');
      const g=hole.geometry,zRange=g.axial_range_m.map(t=>g.origin[2]+g.axis[2]*t).sort((a,b)=>a-b),expectedZ=g.radius_m<.002?[.040559,.0425]:[.0425,.045021];
      if(zRange.some((value,index)=>Math.abs(value-expectedZ[index])>2e-6))throw new Error('The independent stepped-bore finite segment differs from the reviewed source mesh.');
      result.vertical_holes.push({id:hole.id,radius_m:g.radius_m,z_range_m:zRange,measurement_method:hole.measurement.method,source_triangle_count:g.triangle_indices.length,selection_camera_delta:distance(initial.position,selected.position),focus_ms:performance.now()-focusStart,visible_source_samples:visibleSamples,source_sample_count:sampleCount,focused_camera:await camera(page)});
      await page.screenshot({path:path.join(out,`after-vertical-${g.radius_m<.002?'2.2':'5'}.png`)});
    }
    await page.setViewportSize({width:1100,height:900});await page.screenshot({path:path.join(out,'after-narrow.png')});if(!await page.evaluate(()=>document.body.scrollWidth<=innerWidth))throw new Error('The page overflows horizontally.');await page.setViewportSize({width:1600,height:1000});
    const ownerByInterface=new Map(data.assembly.interfaces.map(item=>[item.id,item.owner_ref]));
    const originalPairs=new Set();for(const connection of data.assembly.connections){const refs=[...new Set(connection.endpoints.map(endpoint=>ownerByInterface.get(endpoint.interface_ref)))];if(refs.some(ref=>!ref))throw new Error('A reference connection has an unresolved interface owner.');for(let a=0;a<refs.length;a++)for(let b=a+1;b<refs.length;b++)originalPairs.add([refs[a],refs[b]].sort().join('|'));}
    const choices=detail.compatibility_pairs.filter(pair=>!originalPairs.has([...pair.owner_refs].sort().join('|'))&&Object.keys(pair.template_counts??{}).some(key=>key.includes('fastener')||key.includes('screw')));
    const pair=choices[0];if(!pair)throw new Error('No non-reference pair with standard-connector candidates was published.');
    await page.getByRole('tab',{name:'兼容候选',exact:true}).click();const other=pair.owner_refs.find(ref=>ref!==owner.id);await page.getByRole('textbox',{name:'筛选兼容对端'}).fill(data.parts.find(part=>part.id===other).name);
    const pairStart=performance.now();await page.locator(`[data-compatibility-pair-row="${pair.id}"]`).click();await expect(page.locator('[data-compatibility-candidate]').first()).toBeVisible();
    const pairOpenMs=performance.now()-pairStart;
    const pairRead=await json(pair.path.startsWith('/')?pair.path:data.assembly.capability_index.asset_base+pair.path),pairDetail=pairRead.data;
    const candidate=pairDetail.candidates.find(candidate=>candidate.connector_requirements?.length);if(!candidate)throw new Error('The selected pair has no standard-connector requirement.');
    result.new_pair={id:pair.id,owner_refs:pair.owner_refs,already_in_reference:false,open_ms:pairOpenMs,encoded_bytes:pairRead.encoded_bytes,decoded_bytes:pairRead.decoded_bytes,candidate_count:pairDetail.candidates.length,template_ref:candidate.template_ref,connector_requirements:candidate.connector_requirements,unresolved_conditions:candidate.unresolved_conditions};
    const card=page.locator(`[data-compatibility-candidate="${candidate.id}"]`);await card.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'after-new-pair.png')});
    await expect(page.getByText('部件对检查记录',{exact:true})).toBeVisible();
    const peer=candidate.endpoints.find(endpoint=>endpoint.owner_ref===other),peerIndex=candidate.endpoints.indexOf(peer),section=card.locator('.capability-candidate-ends > div').nth(peerIndex),pool=section.locator('details');if(!await pool.evaluate(element=>element.open))await pool.locator('summary').click();
    await settled(page);await Promise.all(pending);const initial=await camera(page);await page.locator('canvas.scene-webgl').evaluate(canvas=>canvas.dataset.capabilityProbe='retained');const requestsBefore=network.filter(item=>item.path.endsWith('.stl')).length;
    const switchStart=performance.now();await section.locator('[data-capability-endpoint-feature]').first().click();await expect(page.locator('.object-id')).toContainText(other);await expect(page.locator('[data-active-capability-feature]')).toBeVisible();
    result.peer_switch_ms=performance.now()-switchStart;const selected=await camera(page);result.peer_selection_camera_delta=distance(initial.position,selected.position);if(result.peer_selection_camera_delta>1e-10||distance(initial.target,selected.target)>1e-10)throw new Error('Candidate peer navigation moved the camera.');
    await expect(page.locator('canvas.scene-webgl')).toHaveAttribute('data-capability-probe','retained');await Promise.all(pending);result.stl_requests_added_by_hydration=network.filter(item=>item.path.endsWith('.stl')).length-requestsBefore;
    if(result.stl_requests_added_by_hydration)throw new Error('Capability hydration reloaded source meshes.');
    result.idle_renders_after_navigation=await idle(page);
    if(result.idle_renders_after_navigation>2)throw new Error('Candidate peer selection continued rendering while settled and idle.');
  }
  await Promise.all(pending);result.network=network;result.page_errors=errors;if(errors.length)throw new Error(errors.join('\n'));results.push(result);await context.close();
 }
 await fs.writeFile(path.join(out,'measurements.json'),JSON.stringify({measured_at:new Date().toISOString(),origin,viewport:[1600,1000],api_state:'First server read is recorded separately; browser runs then reuse the validated server snapshot.',results},null,2)+'\n');
 console.log(JSON.stringify({output:out,results:results.map(({network,...result})=>result)},null,2));
}finally{await browser.close();}
