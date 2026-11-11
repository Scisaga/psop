import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {defaultRegistry,readRegistry,findSnapshot,readPackageEntry} from './dkp.mjs';
import {createSimulationStore} from './simulate-store.mjs';
import {withReferencePairs} from './simulate-reference.mjs';
import {createSimulationGeometry} from './simulate-geometry.mjs';
import {assessAssembly} from '../../../skills/psop-build/scripts/assembly-judgment.mjs';

const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const registry=await readRegistry(),workspace=option('--workspace','microduck'),snapshot=option('--snapshot',registry.workspaces.find(w=>w.id===workspace)?.selectedSnapshotId);
const bundle=await findSnapshot(workspace,snapshot,defaultRegistry),decode=b=>JSON.parse((b[0]===31&&b[1]===139?gunzipSync(b):b).toString('utf8'));
const scene=decode(await readPackageEntry(bundle,bundle.manifest.entrypoints.scene)),manifest=await readFile(path.join(bundle.root,'manifest.json'));
const index=withReferencePairs(scene,decode(await readPackageEntry(bundle,scene.assembly.capability_index.compatibility.index_path)));
const details=new Map(await Promise.all(scene.parts.map(async p=>[p.id,decode(await readPackageEntry(bundle,scene.assembly.capability_index.parts[p.id].path))])));
const expected=new Map(),excluded=[];
for(const pair of index.pairs)for(const id of pair.reference_connections)expected.set(id,pair.owner_refs);
for(const d of details.values())for(const c of d.reference_connections??[])if(c.basis==='incompatible'&&!excluded.includes(c.id))excluded.push(c.id);
const genericMatches=new Map();
for(const pair of index.pairs.filter(p=>p.candidate_count>0)){
  const data=decode(await readPackageEntry(bundle,pair.path));
  for(const c of data.candidates??[])for(const match of c.interface_matches??[]){
    for(const [side,n] of [['a',0],['b',1]])assert.ok(details.get(pair.owner_refs[n]).interfaces.some(i=>i.id===match['interface_'+side+'_ref']),'Template endpoint must exist: '+match.id);
    genericMatches.set(c.id+'|'+match.id,{owners:pair.owner_refs,interfaces:[match.interface_a_ref,match.interface_b_ref],checked:(match.alignment_options??[]).filter(o=>(o.assembly_assessment?o.assembly_assessment.decision!=='block':o.interference?.status==='clear')&&o.registration?.whole_part_collision_evaluated).length});
  }
}
const directory=await mkdtemp(path.join(os.tmpdir(),'psop-interface-audit-')),store=createSimulationStore({registryFile:path.join(directory,'registry.json'),load:async()=>bundle});
const dimensionalExclusions=excluded.filter(id=>id.endsWith('exclude_servo_disk_bore_fit'));
for(const id of dimensionalExclusions){const relation=[...details.values()].flatMap(d=>d.reference_connections??[]).find(c=>c.id===id),refs=relation.endpoints.map(e=>e.interface_ref).sort();assert.ok(![...genericMatches.values()].some(m=>JSON.stringify([...m.interfaces].sort())===JSON.stringify(refs)),'OD16 servo disk must not become an ID10 bearing fit: '+id);}
try{
  let s=await store.create(workspace,snapshot,{name:'接口覆盖核对'});const rows=[],seenRefs=new Map(),seenMatches=new Map(),types={},referenceOptions=new Map(),queries=new Map();
  for(const configuration of s.reference_configurations){
    if(configuration.id!==s.reference_configuration_ref)s=await store.command(workspace,snapshot,s.id,{type:'set_reference_configuration',configuration_ref:configuration.id,expected_revision:s.revision,request_id:crypto.randomUUID()});
    for(const part of scene.parts){const q=await store.candidates(workspace,snapshot,s.id,{instance_id:'instance:'+part.id,expected_revision:s.revision}),prior=queries.get(part.id);queries.set(part.id,prior?{...q,candidates:[...new Map([...prior.candidates,...q.candidates].map(c=>[c.id,c])).values()]}:q);}
  }
  for(const part of scene.parts){
    const d=details.get(part.id),result=queries.get(part.id);
    assert.deepEqual(result.interfaces.map(i=>i.id).sort(),d.interfaces.map(i=>i.id).sort(),'All interfaces must be returned: '+part.name);
    for(const c of result.candidates){
      const seen=c.source_kind==='reference_connection'?seenRefs:seenMatches,matchKey=c.source_kind==='reference_connection'?c.source_match_ref:c.source_candidate_ref+'|'+c.source_match_ref;if(!seen.has(matchKey))seen.set(matchKey,new Set());seen.get(matchKey).add(part.id);
      assert.equal(c.endpoints[0].instance_id,'instance:'+part.id);if(!c.unavailable_reason)assert.ok(c.endpoints.every(e=>e.member_refs.length&&e.resource_keys.length));
      if(c.source_kind==='reference_connection'){assert.equal(c.whole_part_collision_evaluated,false,'Reference records cannot inherit an unchecked clear result');referenceOptions.set(c.source_match_ref+'|'+c.source_configuration_ref,c);}
    }
    for(const i of d.interfaces){
      const options=result.candidates.filter(c=>c.endpoints[0].interface_ref===i.id),refs=options.filter(c=>c.source_kind==='reference_connection'),generic=options.filter(c=>c.source_kind!=='reference_connection');
      for(const mode of i.modes??[])types[mode]=(types[mode]??0)+1;
      rows.push({part_ref:part.id,part_name:part.name,interface_ref:i.id,interface_name:i.name,modes:i.modes??[],members:i.members.length,inspected:true,
        template_pose_branches:generic.length,reference_connections:[...new Set(refs.map(c=>c.source_match_ref))],related_parts:[...new Set(options.map(c=>c.target_instance_id.replace(/^instance:/,'')))],
        status:options.length?'possibilities_available':'no_published_match_or_terminal_pose'});
    }
    console.log(part.name+': '+d.interfaces.length+' interfaces, '+new Set(result.candidates.map(c=>c.target_instance_id)).size+' related parts');
  }
  for(const [id,owners] of expected)assert.deepEqual([...(seenRefs.get(id)??[])].sort(),[...owners].sort(),'Both directions of reference connection must be exposed: '+id);
  for(const [id,match] of genericMatches)if(match.checked)assert.deepEqual([...(seenMatches.get(id)??[])].sort(),[...match.owners].sort(),'Both directions of checked template match must be exposed: '+id);
  const referenceGeometry=[];
  if(args.includes('--geometry')){
    const pool=createSimulationGeometry(),sources=new Map(),byPart=new Map(scene.parts.map(p=>[p.id,p]));
    for(const p of scene.parts)if(!sources.has(p.geometryUrl)){const bytes=await readPackageEntry(bundle,p.geometryUrl);sources.set(p.geometryUrl,{path:path.join(bundle.root,...p.geometryUrl.split('/')),sha256:createHash('sha256').update(bytes).digest('hex')});}
    try{await Promise.all([...referenceOptions.values()].map(async c=>{
      const a=byPart.get(c.target_instance_id.replace(/^instance:/,'')),b=byPart.get(c.moving_instance_id.replace(/^instance:/,'')),e=c.relative_transform,started=performance.now();
      const result=await pool.evaluate({a:sources.get(a.geometryUrl),b:sources.get(b.geometryUrl),r:[[e[0],e[4],e[8]],[e[1],e[5],e[9]],[e[2],e[6],e[10]]],t:[e[12],e[13],e[14]]});
      referenceGeometry.push({connection_ref:c.source_match_ref,part_refs:[a.id,b.id],part_names:[a.name,b.name],configuration_ref:c.source_configuration_ref,selection_required:!!c.unavailable_reason,...result,
        assembly_assessment:assessAssembly({observation:result,reference:true,policy:s.assembly_policy,configuration_ref:c.source_configuration_ref,independent_block:c.unavailable_reason?'member_selection_required':null}),duration_ms:performance.now()-started});
    }));}finally{pool.close();}
    referenceGeometry.sort((a,b)=>a.connection_ref.localeCompare(b.connection_ref));
    assert.equal(referenceGeometry.length,referenceOptions.size);
  }
  assert.deepEqual(await readFile(path.join(bundle.root,'manifest.json')),manifest);
  const report={date:new Date().toISOString(),workspace,snapshot,package_digest:bundle.manifest.package_digest,source_manifest_sha256:createHash('sha256').update(manifest).digest('hex'),source_unchanged:true,
    summary:{parts:scene.parts.length,interfaces:rows.length,inspected:rows.length,with_possibilities:rows.filter(r=>r.status==='possibilities_available').length,without_published_match:rows.filter(r=>r.status!=='possibilities_available').length,reference_connections:expected.size,checked_template_matches:seenMatches.size,excluded_incompatible_references:excluded.length},
    interface_modes:types,excluded_incompatible_reference_ids:excluded,independent_dimensional_exclusions_checked:dimensionalExclusions,reference_geometry:referenceGeometry,interfaces:rows};
  report.summary.reference_configuration_variants=referenceOptions.size;
  const legacyPath=path.resolve(option('--legacy',fileURLToPath(new URL('../../../docs/simulate/evidence/interface-coverage.json',import.meta.url))));
  try{if(referenceGeometry.length){const bytes=await readFile(legacyPath),legacy=JSON.parse(bytes),current=new Map(referenceGeometry.map(r=>[r.connection_ref+'|'+r.configuration_ref,r]));
    report.legacy_geometry_audit={source:legacyPath,sha256:createHash('sha256').update(bytes).digest('hex'),records:legacy.reference_geometry.length,unchanged:0,missing:[],differences:[]};
    for(const old of legacy.reference_geometry){const identity=old.connection_ref+'|'+old.configuration_ref,now=current.get(identity);if(!now){report.legacy_geometry_audit.missing.push(identity);continue;}if(now.status===old.status&&Math.abs((now.intersection_volume_m3??0)-(old.intersection_volume_m3??0))<1e-15)report.legacy_geometry_audit.unchanged++;else report.legacy_geometry_audit.differences.push({identity,old_status:old.status,new_status:now.status,old_volume_m3:old.intersection_volume_m3,new_volume_m3:now.intersection_volume_m3});}
  }}catch(error){if(error.code!=='ENOENT')throw error;}
  if(referenceGeometry.length)report.summary.reference_geometry=Object.fromEntries(['clear','interference','unresolved'].map(status=>[status,referenceGeometry.filter(r=>r.status===status).length]));
  const output=path.resolve(option('--output','.runtime/simulate-review/interface-coverage.json'));await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({summary:report.summary,output}));
}finally{store.close();await rm(directory,{recursive:true,force:true});}
