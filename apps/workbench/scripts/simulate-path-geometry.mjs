import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Box3,Matrix4,Quaternion,Vector3} from 'three';
import Module from '../../../skills/psop-build/scripts/vendor/manifold-3d/manifold.js';

const vendor=new URL('../../../skills/psop-build/scripts/vendor/manifold-3d/',import.meta.url);
let runtime;
async function engine(){
 if(!runtime)runtime=(async()=>{const lock=JSON.parse(await readFile(new URL('SOURCE.json',vendor),'utf8'));for(const [name,digest]of Object.entries(lock.files))if(createHash('sha256').update(await readFile(new URL(name,vendor))).digest('hex')!==digest)throw Error('Pinned motion geometry engine changed: '+name);const wasm=await Module();wasm.setup();return wasm;})();return runtime;
}
const poseMatrix=p=>new Matrix4().compose(new Vector3().fromArray(p.position),new Quaternion().fromArray(p.quaternion),new Vector3(1,1,1));
const transform=(p,e)=>[e[0]*p[0]+e[4]*p[1]+e[8]*p[2]+e[12],e[1]*p[0]+e[5]*p[1]+e[9]*p[2]+e[13],e[2]*p[0]+e[6]*p[1]+e[10]*p[2]+e[14]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const axes=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

/** Whole source meshes; finite surface sampling is reported separately from fit/physics qualification. */
export async function createMotionGeometry({parts,geometries,spacing_m=.002,contact_margin_m=.0004,reference_instances=[]}){
 const wasm=await engine(),shapes=new Map(),byPart=new Map(),stats={mesh_count:0,part_count:parts.length,sample_count:0,ray_queries:0,pair_queries:0,proxy_parts:[]};
 const spacing=spacing_m*1000,margin=contact_margin_m*1000,references=new Map(reference_instances.map(p=>[p.part_ref,p])),profiles=new Map();
 for(const part of parts){
  const source=geometries.find(g=>g.key===part.geometryUrl);if(!source)throw Error('Missing motion geometry: '+part.id);const bytes=Buffer.from(source.bytes),scale=part.scale??[1,1,1],key=source.key+'|'+scale.join(',');
  if(!shapes.has(key)){
   const count=bytes.readUInt32LE(80),vertices=[],triangles=[],ids=new Map(),samples=new Map(),addSample=p=>{const key=p.map(v=>Math.round(v/spacing)).join(',');if(!samples.has(key))samples.set(key,p);};
   if(bytes.length!==84+count*50)throw Error('Invalid motion source mesh');
   const bounds=new Box3();
   for(let n=0;n<count;n++){
    const triangle=[];for(let k=0;k<3;k++){const p=[0,1,2].map(j=>bytes.readFloatLE(84+n*50+12+k*12+j*4)*scale[j]*1000),weld=p.map(v=>Math.round(v/1e-5)).join(',');if(!ids.has(weld)){ids.set(weld,vertices.length/3);vertices.push(...p);}triangles.push(ids.get(weld));triangle.push(p);bounds.expandByPoint(new Vector3().fromArray(p));addSample(p);}
    const [a,b,c]=triangle,longest=Math.max(Math.hypot(...a.map((v,k)=>v-b[k])),Math.hypot(...a.map((v,k)=>v-c[k])),Math.hypot(...b.map((v,k)=>v-c[k]))),divisions=Math.max(1,Math.ceil(longest/spacing));
    for(let i=0;i<=divisions;i++)for(let j=0;j<=divisions-i;j++)addSample(a.map((v,k)=>v+(b[k]-v)*i/divisions+(c[k]-v)*j/divisions));
   }
   let solid,proxy=false;try{solid=new wasm.Manifold(new wasm.Mesh({numProp:3,vertProperties:new Float32Array(vertices),triVerts:new Uint32Array(triangles)}));}catch{}
   if(!solid||solid.status()!=='NoError'||solid.isEmpty()){solid?.delete();const size=bounds.getSize(new Vector3());solid=wasm.Manifold.cube(size.toArray()).translate(bounds.min.toArray());proxy=true;}
   // Interleave distant regions so an early obstruction witness is not biased to the STL's face order.
   const cloud=[...samples.values()],ordered=[];for(let r=0;r<17;r++)for(let i=r;i<cloud.length;i+=17)ordered.push(cloud[i]);
   shapes.set(key,{solid,bounds,samples:ordered,proxy});stats.mesh_count++;stats.sample_count+=ordered.length;
  }
  const shape=shapes.get(key);byPart.set(part.id,shape);if(shape.proxy)stats.proxy_parts.push(part.id);
 }
 const rays=(shape,a,b)=>{stats.ray_queries++;return shape.solid.rayCast(a,b);};
 function depth(shape,p){
  let minimum=Infinity;const length=Math.max(1000,shape.bounds.getSize(new Vector3()).length()*3);
  for(const direction of axes){const hit=rays(shape,p,p.map((v,k)=>v+direction[k]*length)).find(h=>h.distance>1e-9);if(!hit||dot(hit.normal,direction)<=1e-9)return 0;minimum=Math.min(minimum,hit.distance*length);}return minimum;
 }
 function profile(a,b){
  const key=[a.part_ref,b.part_ref].sort().join('|');if(profiles.has(key))return profiles.get(key);
  const pa=references.get(a.part_ref)??a,pb=references.get(b.part_ref)??b,sa=byPart.get(a.part_ref),sb=byPart.get(b.part_ref);let maximum=0,count=0;
  for(const [from,to,p,q]of [[sa,sb,pa,pb],[sb,sa,pb,pa]]){const e=poseMatrix(q).invert().multiply(poseMatrix(p)).elements;e[12]*=1000;e[13]*=1000;e[14]*=1000;for(const sample of from.samples){const at=transform(sample,e);if(!to.bounds.containsPoint(new Vector3().fromArray(at)))continue;const d=depth(to,at);if(d>0){count++;maximum=Math.max(maximum,d);}}}
  const value={maximum_depth_m:maximum/1000,contact_sample_count:count};profiles.set(key,value);return value;
 }
 function scan(moving,fixed,relative,delta,referenceDepth=0,stopAtFirst=true){
  const e=relative.elements,travel=Math.hypot(...delta),witnesses=[];if(travel<1e-8)return witnesses;
  // Meshes are in mm. Relative rotations are unchanged, translations need the same units.
  e[12]*=1000;e[13]*=1000;e[14]*=1000;
  const lo=fixed.bounds.min,hi=fixed.bounds.max;
  for(const sample of moving.samples){
   const a=transform(sample,e),b=a.map((v,k)=>v+delta[k]);if(a.some((v,k)=>Math.max(v,b[k])<[lo.x,lo.y,lo.z][k]||Math.min(v,b[k])>[hi.x,hi.y,hi.z][k]))continue;
   const hits=rays(fixed,a,b).filter(h=>Math.abs(dot(h.normal,delta))>1e-8);
   if(!hits.length){if(fixed.bounds.containsPoint(new Vector3().fromArray(b))){const penetration=depth(fixed,b),baseline=Math.max(referenceDepth,depth(fixed,a));if(penetration>baseline+margin){witnesses.push({point_mm:b,travel_fraction:1,penetration_m:penetration/1000,initial_penetration_m:baseline/1000});if(stopAtFirst)return witnesses;}}continue;}
   const initialInside=dot(hits[0].normal,delta)>0;let begin=initialInside?0:null,baseline;
   for(const hit of [...hits,{normal:delta,distance:1}]){
    const enter=dot(hit.normal,delta)<0,t=Math.max(0,Math.min(1,hit.distance));if(enter){if(begin===null)begin=t;continue;}if(begin===null)continue;
    if((t-begin)*travel>margin){
     const at=(begin+t)/2,p=a.map((v,k)=>v+delta[k]*at),penetration=depth(fixed,p);
     if(penetration>margin){
      baseline??=Math.max(referenceDepth,initialInside?depth(fixed,a):0);
      if(penetration>baseline+margin){witnesses.push({point_mm:p,travel_fraction:at,penetration_m:penetration/1000,initial_penetration_m:baseline/1000});if(stopAtFirst)return witnesses;}
     }
    }begin=null;
   }
  }
  return witnesses;
 }
 return {
  spacing_m,contact_margin_m,stats,
  shape:ref=>byPart.get(ref),
  setReference(instances){references.clear();for(const p of instances)references.set(p.part_ref,p);profiles.clear();},
  referenceProfile:profile,
  referenceObservations:()=>[...profiles].map(([pair,observation])=>({part_refs:pair.split('|'),...observation})).filter(o=>o.contact_sample_count),
  sweep(a,b,offset){
   stats.pair_queries++;const ma=poseMatrix(a),mb=poseMatrix(b),relative=mb.clone().invert().multiply(ma),delta=new Vector3().fromArray(offset).applyQuaternion(new Quaternion().fromArray(b.quaternion).invert()).multiplyScalar(1000).toArray();
   const referenceDepth=profile(a,b).maximum_depth_m*1000;let found=scan(byPart.get(a.part_ref),byPart.get(b.part_ref),relative,delta,referenceDepth);
   if(found.length)return {blocked:true,moving_ref:a.part_ref,fixed_ref:b.part_ref,...found[0]};
   const reverse=ma.clone().invert().multiply(mb),back=new Vector3().fromArray(offset).negate().applyQuaternion(new Quaternion().fromArray(a.quaternion).invert()).multiplyScalar(1000).toArray();found=scan(byPart.get(b.part_ref),byPart.get(a.part_ref),reverse,back,referenceDepth);
   return found.length?{blocked:true,moving_ref:a.part_ref,fixed_ref:b.part_ref,reverse:true,...found[0]}:{blocked:false};
  },
  overlap(a,b,{respectReference=true}={}){
   const relative=poseMatrix(b).invert().multiply(poseMatrix(a)),e=relative.elements;e[12]*=1000;e[13]*=1000;e[14]*=1000;const shape=byPart.get(b.part_ref);
   const threshold=margin+(respectReference?profile(a,b).maximum_depth_m*1000:0);
   for(const sample of byPart.get(a.part_ref).samples){const p=transform(sample,e);if(!shape.bounds.containsPoint(new Vector3().fromArray(p)))continue;const penetration=depth(shape,p);if(penetration>threshold)return {penetration_m:penetration/1000,reference_depth_m:(threshold-margin)/1000,point_mm:p};}return null;
  },
  close(){for(const shape of shapes.values())shape.solid.delete();shapes.clear();byPart.clear();}
 };
}
