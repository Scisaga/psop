/** Persistent, offline whole-solid CSG worker. Metres in/out; millimetres in
 * the pinned float32 mesh engine. No mesh repairs or display gaps are used. */
import fs from 'node:fs/promises';
import readline from 'node:readline';
import {createHash} from 'node:crypto';
import Module from './vendor/manifold-3d/manifold.js';
import {contactDiagnostics} from './solid-contact-diagnostics.mjs';
import {assessAssembly} from './assembly-judgment.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const vendor=new URL('./vendor/manifold-3d/',import.meta.url),lock=JSON.parse(await fs.readFile(new URL('SOURCE.json',vendor),'utf8'));
for(const [name,digest] of Object.entries(lock.files))if(sha(await fs.readFile(new URL(name,vendor)))!==digest)throw Error('Pinned solid engine changed: '+name);
const wasm=await Module();wasm.setup();const {Mesh,Manifold}=wasm,solids=new Map(),sourceMeshes=new Map();
const epsilon=.0003; // 3e-7 m: finite source-plane precision, not a fit allowance.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
async function solid(input){
  if(solids.has(input.sha256))return solids.get(input.sha256);
  let vertices=[],triangles=[];
  if(input.path){
    const raw=await fs.readFile(input.path);if(sha(raw)!==input.sha256)throw Error('Captured source mesh changed');
    const count=raw.readUInt32LE(80);if(raw.length!==84+50*count||count>2000000)throw Error('Invalid source STL');
    const ids=new Map();
    for(let i=0;i<count;i++)for(let k=0;k<3;k++){
      const p=[0,1,2].map(j=>raw.readFloatLE(84+50*i+12+k*12+j*4));if(!p.every(Number.isFinite))throw Error('Nonfinite source vertex');
      const key=p.map(v=>Math.round(v/1e-8)).join(',');
      if(!ids.has(key)){ids.set(key,vertices.length/3);vertices.push(...p.map(v=>v*1000));}triangles.push(ids.get(key));
    }
  }else{vertices=input.vertices.flatMap(p=>p.map(v=>v*1000));triangles=input.faces.flat();}
  let value;
  try{value=new Manifold(new Mesh({numProp:3,vertProperties:new Float32Array(vertices),triVerts:new Uint32Array(triangles)}));}
  catch{return null;}
  if(value.status()!=='NoError'){value.delete();return null;}
  sourceMeshes.set(input.sha256,{vertices:Array.from({length:vertices.length/3},(_,n)=>vertices.slice(n*3,n*3+3)),triangles});
  solids.set(input.sha256,value);return value;
}
function thinComponent(component){
  const volume=Math.abs(component.volume()),area=component.surfaceArea();
  if(volume<=epsilon**3)return {thin:true,width:0};
  // A body inside a strip of width w has V <= w*S/2. Avoid testing all
  // triangle normals for substantial three-dimensional intersections.
  if(2*volume>epsilon*area)return {thin:false,width:null};
  const mesh=component.getMesh(),points=[];
  for(let i=0;i<mesh.vertProperties.length;i+=mesh.numProp)points.push(Array.from(mesh.vertProperties.slice(i,i+3)));
  const directions=[[1,0,0],[0,1,0],[0,0,1]],seen=new Set();
  for(let i=0;i<mesh.triVerts.length;i+=3){
    const [a,b,c]=Array.from(mesh.triVerts.slice(i,i+3),v=>points[v]),n=cross(sub(b,a),sub(c,a)),length=Math.hypot(...n);
    if(length<1e-18)continue;const axis=n.map(v=>v/length),key=axis.map(v=>Math.round(v*1e7)).join(',');
    if(!seen.has(key)){seen.add(key);directions.push(axis);}
  }
  let smallest=Infinity;
  for(const axis of directions){let lo=Infinity,hi=-Infinity;for(const p of points){const d=dot(p,axis);lo=Math.min(lo,d);hi=Math.max(hi,d);}smallest=Math.min(smallest,hi-lo);if(hi-lo<=epsilon)return {thin:true,width:hi-lo};}
  // A curved precision contact (for example a complete bearing ring) has no
  // single thin projection. Erode it by a cube inscribed in the precision
  // ball. Empty erosion proves there is no interior ball of radius eps/2;
  // any substantial local overlap survives, even with arbitrarily thin tails.
  const size=epsilon/Math.sqrt(3),probe=Manifold.cube([size,size,size],true);
  let core;
  try{
    core=component.minkowskiDifference(probe);
    if(core.status()!=='NoError')throw Error('Numerical-contact erosion failed');
    return {thin:core.isEmpty(),width:null,erosion:core.isEmpty()};
  }finally{core?.delete();probe.delete();}
}
async function evaluate(request){
  const a=await solid(request.a),b=await solid(request.b),base={method:'closed-source-solid-interference/2',engine:'manifold-3d@3.5.4',numerical_contact_allowance_m:epsilon/1000,source_sha256_a:request.a.sha256,source_sha256_b:request.b.sha256};
  if(!a||!b)return {...base,status:'unresolved',reason:'source_is_not_closed_oriented_manifold'};
  const {r,t}=request,placed=b.transform([r[0][0],r[1][0],r[2][0],0,r[0][1],r[1][1],r[2][1],0,r[0][2],r[1][2],r[2][2],0,...t.map(v=>v*1000),1]);
  const common=a.intersect(placed);
  try{
    const volume=common.volume();if(common.status()!=='NoError'||!Number.isFinite(volume))return {...base,status:'unresolved',reason:'solid_boolean_failed'};
    if(common.isEmpty()||Math.abs(volume)<=epsilon**3)return {...base,status:'clear',proof:'empty_solid_intersection',intersection_volume_m3:volume/1e9};
    const components=common.decompose();let thin=true,width=0,curved=false,diagnostics;
    try{for(const c of components){const check=thinComponent(c);if(!check.thin){thin=false;break;}curved=curved||!!check.erosion;if(check.width!==null)width=Math.max(width,check.width);}
      if(request.diagnostics&&!thin)diagnostics=contactDiagnostics({a,b,placed,meshes:[sourceMeshes.get(request.a.sha256),sourceMeshes.get(request.b.sha256)],shaA:request.a.sha256,shaB:request.b.sha256,
        placement:[r[0][0],r[1][0],r[2][0],0,r[0][1],r[1][1],r[2][1],0,r[0][2],r[1][2],r[2][2],0,...t.map(v=>v*1000),1],components});
    }
    finally{for(const c of components)c.delete();}
    return {...base,status:thin?'clear':'interference',proof:thin?curved?'no_interior_at_source_precision':'intersection_confined_to_source_precision_strips':'positive_solid_intersection',
      intersection_volume_m3:volume/1e9,...(diagnostics?{diagnostics}:{}),...(thin?curved?{numerical_core_probe_side_m:epsilon/1000/Math.sqrt(3),precision_ball_radius_m:epsilon/2000}:{maximum_numerical_strip_width_m:width/1000}:{witness:{kind:'positive_source_solid_volume'}})};
  }finally{common.delete();placed.delete();}
}
for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
  try{const request=JSON.parse(line);if(request.operation==='assess'){process.stdout.write(JSON.stringify(assessAssembly(request.input))+'\n');continue;}const observation=await evaluate(request);if(request.assembly_policy)observation.assembly_assessment=assessAssembly({observation,policy:request.assembly_policy,expected_contact:true,mechanism:request.mechanism});process.stdout.write(JSON.stringify(observation)+'\n');}
  catch(error){process.stdout.write(JSON.stringify({error:error.message})+'\n');}
}
for(const solid of solids.values())solid.delete();
