/** Capture existing measured geometry for independently recorded audit findings. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.join(repo,'build/original-installation-audit');
const report=JSON.parse(await fs.readFile(path.join(out,'findings.json'),'utf8'));
const origin=process.env.PSOP_CAPTURE_BASE_URL||'http://127.0.0.1:8780';
const catalog=await(await fetch(origin+'/api/workspaces')).json();
const workspace=catalog.workspaces.find(w=>w.id==='microduck');
const browser=await chromium.launch({channel:'chrome',headless:true});
const shots=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000},reducedMotion:'reduce'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>localStorage.setItem('psop.workbench.inspector-width','420'));
 const cases=[];
 for(const finding of report.findings){
  const witnesses=finding.kind==='shaft_bore_observation'?finding.witnesses.filter(w=>w.mesh_key==='motor_support'):[finding.witnesses[0]];
  for(const witness of witnesses)cases.push({finding,witness});
 }
 for(const {finding,witness} of cases){
  const query=new URLSearchParams({workspace:workspace.id,snapshot:workspace.selectedSnapshotId,part:witness.owner_ref,feature:witness.feature_ref,detail:'interfaces',labels:'0',explode:'0'});
  await page.goto(origin+'/#explorer?'+query);await page.reload();
  const scene=page.locator('.scene-canvas');
  await expect(scene).toHaveAttribute('data-scene-ready','true',{timeout:60000});
  await expect(scene).toHaveAttribute('data-selected-features',witness.feature_ref,{timeout:30000});
  await page.getByRole('button',{name:'定位本件几何',exact:true}).click();
  await expect(scene).toHaveAttribute('data-camera-flight','settled',{timeout:20000});
  await expect(scene).toHaveAttribute('data-inspection-active','true');
  const samples=Number(await scene.getAttribute('data-focus-visible-source-samples'));
  expect(samples).toBeGreaterThan(0);
  const filename=`${finding.id}-${witness.mesh_key}.png`;
  await page.screenshot({path:path.join(out,filename)});
  shots.push({finding_ref:finding.id,owner_ref:witness.owner_ref,feature_ref:witness.feature_ref,image:filename,url:page.url(),visible_source_samples:samples,source_sample_count:Number(await scene.getAttribute('data-focus-source-sample-count'))});
 }
 expect(errors).toEqual([]);
 await fs.writeFile(path.join(out,'geometry-ui.json'),JSON.stringify({schema:'psop.original-installation-geometry-ui/1',snapshot:workspace.selectedSnapshotId,package_digest:report.package_digest,shots,javascript_errors:errors},null,2)+'\n');
 console.log(JSON.stringify({ok:true,shots:shots.length,errors}));
}finally{await browser.close();}
