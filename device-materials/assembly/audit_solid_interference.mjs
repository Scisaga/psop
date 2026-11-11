/** Independent cold replay of every retained fixed source pose using mesh CSG.
 *
 * Does not import the Python generator, its BVH or the viewer's placement code.
 * Reads original solids and frozen transforms without the Build placement
 * code or viewer. Uses the same pinned, offline solid kernel as production.
 * API: https://manifoldcad.org/docs/jsapi/documents/Using_Manifold.html
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const argument=(name,fallback)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback;
const root=path.resolve(argument('--dkp',path.join(repo,'build/microduck/source-1.15/microduck-capabilities-9.dkp')));
const output=path.resolve(argument('--output',path.join(repo,'build/interference-review/independent-solid-audit.json')));
const engine=path.resolve(argument('--engine',path.join(repo,'skills/psop-build/scripts/vendor/manifold-3d/manifold.js')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=async rel=>{const b=await fs.readFile(path.join(root,rel));return JSON.parse((rel.endsWith('.gz')?gunzipSync(b):b).toString('utf8'));};
const {default:Module}=await import(pathToFileURL(engine).href);const wasm=await Module();wasm.setup();const {Mesh,Manifold}=wasm;
const manifest=await read('manifest.json'),scene=await read('indexes/scene.json'),index=await read('indexes/compatibility.json');
const analysisFile=argument('--analysis',null);let analysis=null;
if(analysisFile)analysis=JSON.parse(gunzipSync(await fs.readFile(analysisFile)).toString('utf8'));
const parts=new Map(scene.parts.map(p=>[p.id,p])),sources=new Map(),unique=new Map();let enumerated=0;
async function solid(owner){
  const part=parts.get(owner);assert.ok(part.scale.every(v=>v===1));
  if(!sources.has(part.geometryUrl)){
    const raw=await fs.readFile(path.join(root,part.geometryUrl)),count=raw.readUInt32LE(80);assert.equal(raw.length,84+50*count);
    const vertices=[],triangles=[],welded=new Map();
    for(let i=0;i<count;i++)for(let k=0;k<3;k++){
      const p=[0,1,2].map(j=>raw.readFloatLE(84+50*i+12+k*12+j*4));assert.ok(p.every(Number.isFinite));
      const key=p.map(v=>Math.round(v/1e-8)).join(',');
      if(!welded.has(key)){welded.set(key,vertices.length/3);vertices.push(...p.map(v=>v*1000));}
      triangles.push(welded.get(key));
    }
    const mesh=new Mesh({numProp:3,vertProperties:new Float32Array(vertices),triVerts:new Uint32Array(triangles)}),value=new Manifold(mesh);
    assert.equal(value.status(),'NoError');sources.set(part.geometryUrl,{value,sha256:sha(raw),source:part.geometryUrl});
  }
  return sources.get(part.geometryUrl);
}
const grouped=new Map();
if(analysis)for(const c of analysis.candidates){const owners=c.endpoints.map(e=>e.owner_ref),key=JSON.stringify(owners);if(!grouped.has(key))grouped.set(key,{owner_refs:owners,candidates:[]});grouped.get(key).candidates.push(c);}
for(const pair of analysis?[...grouped.values()]:index.pairs){
  const detail=analysis?pair:await read(pair.path);if(!analysis)assert.equal(detail.candidates.length,pair.candidate_count);
  for(const candidate of detail.candidates)for(const match of candidate.interface_matches)for(const option of match.alignment_options){
    enumerated++;assert.equal(candidate.placement_evaluated,true);assert.equal(option.interference.status,'clear');assert.equal(option.seating.display_gap_m,0);
    const [a,b]=await Promise.all(pair.owner_refs.map(solid)),r=option.registration.rotation_b_to_a,t=option.registration.translation_b_to_a;
    assert.equal(a.sha256,option.interference.source_sha256_a);assert.equal(b.sha256,option.interference.source_sha256_b);
    const key=JSON.stringify([a.sha256,b.sha256,r.flat().map(v=>Number(v.toFixed(12))),t.map(v=>Number(v.toFixed(12)))]);
    if(!unique.has(key))unique.set(key,{a,b,r,t,option,owners:pair.owner_refs,interfaces:[match.interface_a_ref,match.interface_b_ref]});
  }
}
const poses=[],issues=[];let nearContacts=0;const started=performance.now();
for(const {a,b,r,t,option,owners,interfaces} of unique.values()){
  const transform=[r[0][0],r[1][0],r[2][0],0,r[0][1],r[1][1],r[2][1],0,r[0][2],r[1][2],r[2][2],0,...t.map(v=>v*1000),1];
  const placed=b.value.transform(transform),intersection=a.value.intersect(placed);const volume=intersection.volume()/1e9;
  assert.equal(intersection.status(),'NoError');assert.ok(Number.isFinite(volume));
  const epsilon=option.interference.numerical_contact_allowance_m,axis=option.seating.axis_a;
  let clear=intersection.isEmpty()||Math.abs(volume)<=epsilon**3,contactThickness=0,curvedContact=false;
  if(!clear){
    const components=intersection.decompose();clear=true;
    for(const component of components){
      const mesh=component.getMesh(),vertices=[];
      for(let i=0;i<mesh.vertProperties.length;i+=mesh.numProp)vertices.push(Array.from(mesh.vertProperties.slice(i,i+3),v=>v/1000));
      const normals=[axis,[1,0,0],[0,1,0],[0,0,1]];
      for(let i=0;i<mesh.triVerts.length;i+=3){
        const [a,b,c]=Array.from(mesh.triVerts.slice(i,i+3),id=>vertices[id]),u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]);
        const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);if(length>1e-20)normals.push(n.map(v=>v/length));
      }
      let smallest=Infinity;
      for(const n of normals){let min=Infinity,max=-Infinity;for(const p of vertices){const d=n.reduce((sum,v,k)=>sum+v*p[k],0);min=Math.min(min,d);max=Math.max(max,d);}smallest=Math.min(smallest,max-min);if(smallest<=epsilon)break;}
      contactThickness=Math.max(contactThickness,smallest);
      // Confirm the complete connected overlap is confined to a numerical
      // precision strip. Never accept a mere small volume percentage.
      if(Math.abs(component.volume()/1e9)>epsilon**3&&smallest>epsilon){
        curvedContact=true;
        const edge=epsilon*1000/Math.sqrt(3),probe=Manifold.cube([edge,edge,edge],true),core=component.minkowskiDifference(probe);
        if(core.status()!=='NoError'||!core.isEmpty())clear=false;
        core.delete();probe.delete();
      }
      component.delete();
    }
    if(clear)nearContacts++;
  }
  const record={owner_refs:owners,interface_refs:interfaces,source_sha256:[a.sha256,b.sha256],rotation_b_to_a:r,translation_b_to_a:t,
    intersection_volume_m3:volume,numerical_contact_thickness_m:curvedContact?null:contactThickness,
    ...(curvedContact?{precision_core_probe_side_m:epsilon/Math.sqrt(3)}:{}),status:clear?'clear':'unexpected_overlap'};
  poses.push(record);if(!clear)issues.push(record);intersection.delete();placed.delete();
}
for(const s of sources.values())s.value.delete();
const report={ok:issues.length===0,package_version:manifest.package_version,package_digest:manifest.package_digest,checked_pairs:index.pairs.length,
  ...(analysisFile?{unpublished_analysis_sha256:sha(await fs.readFile(analysisFile)),source_package_only:true}:{}),
  published_clear_poses:enumerated,unique_source_poses:unique.size,numerical_plane_contacts:nearContacts,source_meshes:sources.size,
  engine:{name:'manifold-3d',version:JSON.parse(await fs.readFile(path.join(path.dirname(engine),'package.json'),'utf8')).version,
    javascript_sha256:sha(await fs.readFile(engine)),wasm_sha256:sha(await fs.readFile(path.join(path.dirname(engine),'manifold.wasm'))),
    documentation:'https://manifoldcad.org/docs/jsapi/classes/manifold.Manifold.html'},
  elapsed_seconds:(performance.now()-started)/1000,issues,poses};
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,poses:undefined,issues:issues.length}));if(!report.ok)process.exitCode=1;
