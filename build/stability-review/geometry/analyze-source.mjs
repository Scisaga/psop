import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {STLLoader} from '../../../apps/workbench/node_modules/three/examples/jsm/loaders/STLLoader.js';
import {Vector3} from '../../../apps/workbench/node_modules/three/build/three.module.js';
const data=JSON.parse(fs.readFileSync('build/stability-review/geometry/baseline-view.json'));
const targets=[{key:'right-y42-z52',meshKey:'right_shell',center:[-.0003,.042,.0525],axis:0,radius:.0008,extent:.0035},{key:'right-x25-y9',meshKey:'right_shell',center:[-.0255,-.0095,.0425],axis:2,radius:.0011,extent:.006},{key:'hip-x17-z6',meshKey:'hip_l',center:[.0175,-.0195,-.006],axis:1,radius:.0012,extent:.0035}];
const cache=new Map(),report=[];
for(const t of targets){
 const part=data.parts.find(p=>p.meshKey===t.meshKey);
 if(!cache.has(part.geometryUrl)){const bytes=await(await fetch('http://127.0.0.1:8780'+part.geometryUrl)).arrayBuffer();cache.set(part.geometryUrl,{bytes,geometry:new STLLoader().parse(bytes)});}
 const {bytes,geometry:g}=cache.get(part.geometryUrl),p=g.getAttribute('position');g.computeVertexNormals();
 const normals=g.getAttribute('normal'),vertexIds=new Map(),edgeMap=new Map(),faces=[],local=[];
 const key=(i)=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v/1e-8)).join(',');
 let degenerate=0;const duplicateFaces=new Set(),seenFaces=new Map();
 for(let first=0;first<p.count;first+=3){
   const ids=[0,1,2].map(j=>{const k=key(first+j);if(!vertexIds.has(k))vertexIds.set(k,vertexIds.size);return vertexIds.get(k);});
   const pts=[0,1,2].map(j=>new Vector3(p.getX(first+j),p.getY(first+j),p.getZ(first+j)));
   const area=pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0])).length()/2;
   if(area<1e-18)degenerate++;
   const faceKey=ids.slice().sort((a,b)=>a-b).join(':');if(seenFaces.has(faceKey))duplicateFaces.add(first/3);else seenFaces.set(faceKey,first/3);
   const near=pts.some(pt=>pt.distanceTo(new Vector3(...t.center))<t.extent);
   const f={index:first/3,ids,area,normal:[normals.getX(first),normals.getY(first),normals.getZ(first)],points:pts.map(v=>v.toArray())};faces.push(f);if(near)local.push(f.index);
   for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],ek=a<b?`${a}:${b}`:`${b}:${a}`;if(!edgeMap.has(ek))edgeMap.set(ek,[]);edgeMap.get(ek).push(f.index);}
 }
 const localSet=new Set(local),hist={},localTopology={boundaryEdges:0,nonmanifoldEdges:0,angles:{'0-10':0,'10-35':0,'35-60':0,'60-90':0,'90-180':0}};
 for(const edge of edgeMap.values())if(edge.some(i=>localSet.has(i))){if(edge.length===1)localTopology.boundaryEdges++;if(edge.length>2)localTopology.nonmanifoldEdges++;if(edge.length===2){const na=faces[edge[0]].normal,nb=faces[edge[1]].normal;const angle=Math.acos(Math.min(1,Math.max(-1,na.reduce((s,v,i)=>s+v*nb[i],0))))*180/Math.PI;localTopology.angles[angle<10?'0-10':angle<35?'10-35':angle<60?'35-60':angle<90?'60-90':'90-180']++;}}
 // Exact source vertices around the selected axis: radial/axial distributions
 // expose bevel/sliver bands without assuming they are an analytic cylinder.
 const unique=new Map();for(const index of local)for(const pt of faces[index].points)unique.set(pt.join(','),pt);
 for(const pt of unique.values()){const radial=Math.hypot(...pt.filter((_,i)=>i!==t.axis).map((v,j)=>v-t.center.filter((_,i)=>i!==t.axis)[j]));const axial=pt[t.axis]-t.center[t.axis];if(radial>t.extent||Math.abs(axial)>t.extent)continue;const bucket=`r${(Math.round(radial*1e4)/10).toFixed(1)}mm @ ${(Math.round(axial*1e4)/10).toFixed(1)}mm`;hist[bucket]=(hist[bucket]||0)+1;}
 const entry=data.analysis.circular_openings.find(o=>o.owner_ref===part.id&&o.geometry.center.every((v,i)=>Math.abs(v-t.center[i])<1e-5));
 const points=entry.geometry.boundary_vertices,center=entry.geometry.center,axis=entry.geometry.normal,r=entry.geometry.radius_m;
 let sag=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],mid=a.map((v,j)=>(v+b[j])/2),d=mid.map((v,j)=>v-center[j]),ax=d.reduce((s,v,j)=>s+v*axis[j],0);const rm=Math.sqrt(d.reduce((s,v)=>s+v*v,0)-ax*ax);sag=Math.max(sag,r-rm);}
 report.push({target:t.key,partRef:part.id,sha256:createHash('sha256').update(new Uint8Array(bytes)).digest('hex'),indexed:!!g.index,triangles:p.count/3,uniqueVerticesAt10nm:vertexIds.size,degenerateFaces:degenerate,duplicateFaces:duplicateFaces.size,boundaryEdges:[...edgeMap.values()].filter(v=>v.length===1).length,nonmanifoldEdges:[...edgeMap.values()].filter(v=>v.length>2).length,localTriangles:local.length,localTopology,opening:{id:entry.id,radiusM:r,boundaryVertexCount:points.length,maxRadialFitResidualM:entry.fit_max_m,maxChordSagM:sag},radialAxialHistogram:hist});
 fs.writeFileSync(`build/stability-review/geometry/${t.key}-source-local.json`,JSON.stringify({target:t,faces:local.map(i=>faces[i])}));
}
fs.writeFileSync('build/stability-review/geometry/source-analysis.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report.map(({radialAxialHistogram,...r})=>r),null,2));
