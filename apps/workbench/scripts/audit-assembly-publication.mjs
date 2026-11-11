import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {loadPackage,readPackageEntry} from './dkp.mjs';

const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const decode=b=>JSON.parse((b[0]===31?gunzipSync(b):b).toString()),sha=b=>createHash('sha256').update(b).digest('hex');
const before=await loadPackage(path.resolve(option('--before','../../build/microduck/source-1.15/microduck-capabilities-9.dkp'))),after=await loadPackage(path.resolve(option('--after','../../build/microduck/source-1.15/microduck-capabilities-10.dkp')));
const read=(bundle,entry)=>readPackageEntry(bundle,entry).then(decode),a=await read(before,before.manifest.entrypoints.scene),b=await read(after,after.manifest.entrypoints.scene);
assert.deepEqual(b.parts.map(p=>[p.id,p.position,p.quaternion,p.scale,p.geometryUrl]),a.parts.map(p=>[p.id,p.position,p.quaternion,p.scale,p.geometryUrl]));
const assets=[];for(const entry of new Set(a.parts.map(p=>p.geometryUrl))){const old=sha(await readPackageEntry(before,entry)),now=sha(await readPackageEntry(after,entry));assert.equal(now,old);assets.push({path:entry,sha256:old});}
const oldIndex=await read(before,a.assembly.capability_index.compatibility.index_path),newIndex=await read(after,b.assembly.capability_index.compatibility.index_path),byPair=new Map(newIndex.pairs.map(p=>[JSON.stringify(p.owner_refs),p]));
function observations(detail){
 const rows=[];
 const push=(template,ia,ib,option,allowed)=>{const r=option.registration,key=JSON.stringify([template,ia,ib,r.rotation_b_to_a.flat().map(v=>Math.round(v*1e12)/1e12),r.translation_b_to_a.map(v=>Math.round(v*1e12)/1e12),option.member_pairs.map(p=>[p.member_a_ref,p.member_b_ref,p.feature_a_ref,p.feature_b_ref]).sort()]);rows.push({key,allowed,geometry:option.interference});};
 for(const c of detail.candidates)for(const m of c.interface_matches??[])for(const o of m.alignment_options)push(c.template_ref,m.interface_a_ref,m.interface_b_ref,o,true);
 for(const e of detail.placement_exclusions??[])for(const o of e.alignment_options)push(e.template_ref,e.interface_a_ref,e.interface_b_ref,o,false);
 return rows;
}
let measured=0,oldAllowed=0,newAllowed=0;const states={};
for(const record of oldIndex.pairs){
 const counterpart=byPair.get(JSON.stringify(record.owner_refs));assert.ok(counterpart);
 const old=observations(await read(before,record.path)),current=observations(await read(after,counterpart.path)),available=new Map();
 for(const row of current){if(!available.has(row.key))available.set(row.key,[]);available.get(row.key).push(row);if(row.allowed)newAllowed++;}
 for(const row of old){const match=available.get(row.key)?.pop();assert.ok(match,'Historical finite placement lost: '+record.id);const x=row.geometry,y=match.geometry;assert.equal(x.status,y.status);assert.equal(x.proof,y.proof);assert.equal(x.source_sha256_a,y.source_sha256_a);assert.equal(x.source_sha256_b,y.source_sha256_b);assert.ok(Math.abs((x.intersection_volume_m3??0)-(y.intersection_volume_m3??0))<1e-15);if(row.allowed){assert.equal(match.allowed,true);oldAllowed++;}measured++;states[x.status]=(states[x.status]??0)+1;}
 assert.equal(current.length,old.length,'Policy changes eligibility, not the captured finite pose search');
}
const report={date:new Date().toISOString(),before:before.manifest.package_digest,after:after.manifest.package_digest,source_instances:a.parts.length,source_poses_unchanged:true,unique_stl_count:assets.length,assets,instance_pairs:oldIndex.pairs.length,historical_pose_observations:measured,historical_geometry_states:states,all_historical_geometry_observations_preserved:true,old_eligible_pose_options:oldAllowed,new_eligible_pose_options:newAllowed,newly_eligible_pose_options:newAllowed-oldAllowed};
await writeFile(path.resolve(option('--output','../../docs/simulate/evidence/publication-policy-1.json')),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,assets:undefined}));
