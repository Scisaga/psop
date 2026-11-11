/** Fit finite enclosing seats without requiring identical surface tessellation.
 * Opposed locating walls and a seating plane fix one proper rigid pose. A
 * curved support is a contact hypothesis, not a congruent shape or mechanics proof.
 */
import {createHash} from 'node:crypto';
import {sourceTriangles,finiteSurface,surfaceDistanceSquared} from './finite-source-surface.mjs';
const sub=(a,b)=>a.map((v,k)=>v-b[k]),add=(a,b)=>a.map((v,k)=>v+b[k]),scale=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const n=Math.hypot(...a);return n>1e-12?scale(a,1/n):null;},mean=ps=>[0,1,2].map(k=>ps.reduce((s,p)=>s+p[k],0)/ps.length);
const rotate=(r,p)=>r.map(row=>dot(row,p)),point=(pose,p)=>add(rotate(pose.r,p),pose.t),span=(ps,axis)=>ps.reduce((v,p)=>{const n=dot(p,axis);return [Math.min(v[0],n),Math.max(v[1],n)];},[Infinity,-Infinity]),mid=v=>(v[0]+v[1])/2,width=v=>v[1]-v[0];
const rotation=(a,b)=>[0,1,2].map(i=>[0,1,2].map(j=>a.reduce((s,v,k)=>s+v[i]*b[k][j],0)));
const cross2=(a,b)=>a[0]*b[1]-a[1]*b[0],sub2=(a,b)=>[a[0]-b[0],a[1]-b[1]];
function triangleOverlap(a,b){
 let polygon=a;const orientation=Math.sign(cross2(sub2(b[1],b[0]),sub2(b[2],b[0])));if(!orientation)return 0;
 for(let k=0;k<3&&polygon.length;k++){
  const start=b[k],edge=sub2(b[(k+1)%3],start),signed=p=>orientation*cross2(edge,sub2(p,start)),next=[];
  for(let n=0;n<polygon.length;n++){const p=polygon[n],q=polygon[(n+1)%polygon.length],dp=signed(p),dq=signed(q),insideP=dp>=-1e-15,insideQ=dq>=-1e-15;if(insideP)next.push(p);if(insideP!==insideQ){const t=dp/(dp-dq);next.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}}polygon=next;
 }
 return Math.abs(polygon.reduce((s,p,k)=>s+cross2(p,polygon[(k+1)%polygon.length]),0))/2;
}
function projectedOverlap(as,bs,axes){
 const project=t=>t.map(p=>axes.map(axis=>dot(p,axis))),ap=as.map(project),bp=bs.map(project);let area=0;
 for(const a of ap){const alo=[Math.min(...a.map(p=>p[0])),Math.min(...a.map(p=>p[1]))],ahi=[Math.max(...a.map(p=>p[0])),Math.max(...a.map(p=>p[1]))];for(const b of bp){if([0,1].some(k=>Math.max(...b.map(p=>p[k]))<alo[k]||Math.min(...b.map(p=>p[k]))>ahi[k]))continue;area+=triangleOverlap(a,b);}}
 return area;
}
export function createBoundedInterfaceFits({features,meshes,parts,margin=4e-5}){
 const profiles=new Map(),cosine=Math.cos(Math.PI/600),surfaceTypes=new Set(['plane','source_region']);
 function member(m,owner){
  const normal=unit(m.direction??[]),fs=m.feature_refs.map(ref=>features.get(ref));if(!normal||fs.some(f=>!f||f.owner_ref!==owner||!surfaceTypes.has(f.geometry?.type)))return null;
  const bytes=meshes.get(owner),patches=fs.map(f=>sourceTriangles(bytes,f.geometry.triangle_indices));if(patches.some(p=>!p?.length))return null;const triangles=patches.flat(),points=triangles.flat(),limits=span(points,normal);
  return {member:m,normal,triangles,points,center:mean(points),planar:width(limits)<=margin};
 }
 function profile(i){
  const key=i.id+'|'+i.members.map(m=>m.id).join('|');if(profiles.has(key))return profiles.get(key);profiles.set(key,null);
  if(i.members.length!==4||!parts.has(i.owner_ref)||parts.get(i.owner_ref).scale?.some(v=>Math.abs(v-1)>1e-10)||!meshes.has(i.owner_ref))return null;
  const ms=i.members.map(m=>member(m,i.owner_ref));if(ms.some(m=>!m))return null;
  for(let a=0;a<ms.length;a++)for(let b=a+1;b<ms.length;b++){
   const wa=ms[a],wb=ms[b];if(!wa.planar||!wb.planar||dot(wa.normal,wb.normal)>-cosine)continue;
   const rest=ms.filter((_,n)=>n!==a&&n!==b),rim=rest.find(m=>m.planar&&Math.abs(dot(m.normal,wa.normal))<.006),support=rest.find(m=>!m.planar);if(!rim||!support||dot(rim.normal,support.normal)<cosine)continue;
   const z=rim.normal,x=unit(sub(wa.normal,scale(z,dot(wa.normal,z))));if(!x)continue;const y=unit(cross(z,x)),wallSpan=dot(x,sub(wb.center,wa.center));if(Math.abs(wallSpan)<=margin)continue;
   const supportOffset=dot(z,sub(support.center,rim.center));if(Math.abs(supportOffset)<=margin)continue;
   const raw=meshes.get(i.owner_ref),view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),count=view.getUint32(80,true);if(view.byteLength!==84+50*count)return null;
   let depth=[Infinity,-Infinity];for(let n=0;n<count;n++)for(let j=0;j<3;j++){const p=[0,1,2].map(k=>view.getFloat32(84+50*n+12+12*j+4*k,true)),v=dot(p,z);depth=[Math.min(depth[0],v),Math.max(depth[1],v)];}
   const seat=mid(span(rim.points,z)),value={walls:[wa,wb],rim,support,axes:[x,y,z],role:Math.sign(wallSpan),depthSign:Math.sign(supportOffset),region:{type:'oriented_box',origin:[0,0,0],axes:[x,y,z],ranges:[span(rim.points,x),span(rim.points,y),supportOffset>0?[seat,depth[1]]:[depth[0],seat]],basis:'finite_locating_walls_seat_and_unchanged_source_depth',source_interface_ref:i.id}};
   profiles.set(key,value);return value;
  }
  return null;
 }
 function match(source,replacement){
  if(source.owner_ref===replacement.owner_ref)return [];const a=profile(source),b=profile(replacement);if(!a||!b||a.role!==b.role||a.depthSign!==b.depthSign)return [];
  const [x,y,z]=a.axes,results=[];
  for(const walls of [b.walls,b.walls.slice().reverse()]){
   const bx=unit(sub(walls[0].normal,scale(b.axes[2],dot(walls[0].normal,b.axes[2])))),by=unit(cross(b.axes[2],bx)),r=rotation(a.axes,[bx,by,b.axes[2]]),bp=m=>m.points.map(p=>rotate(r,p));
   const wallWidth=Math.abs(dot(x,sub(a.walls[1].center,a.walls[0].center))),otherWidth=Math.abs(dot(x,sub(rotate(r,walls[1].center),rotate(r,walls[0].center))));if(Math.abs(wallWidth-otherWidth)>margin)continue;
   const rim=bp(b.rim),rimWidth=width(span(a.rim.points,x)),rimLength=width(span(a.rim.points,y));if(Math.abs(rimWidth-width(span(rim,x)))>margin||Math.abs(rimLength-width(span(rim,y)))>margin)continue;
   const tx=dot(x,sub(a.walls[0].center,rotate(r,walls[0].center))),tz=dot(z,sub(a.rim.center,rotate(r,b.rim.center))),ty=mid(span(a.rim.points,y))-mid(span(rim,y)),pose={r,t:add(add(scale(x,tx),scale(y,ty)),scale(z,tz))};
   const selectedA=[...a.walls,a.rim,a.support],selectedB=[...walls,b.rim,b.support],mapping=[],overlaps=[];let valid=true;
   for(let k=0;k<selectedA.length;k++){
    const am=selectedA[k],bm=selectedB[k],placed=bm.triangles.map(t=>t.map(p=>point(pose,p))),points=placed.flat();if(dot(am.normal,rotate(r,bm.normal))<cosine){valid=false;break;}
    // The same translation must align both complete wall lengths and the rim.
    if(k<2&&span(am.points,y).some((v,n)=>Math.abs(v-span(points,y)[n])>margin)){valid=false;break;}
    if(k===3){const sa=span(am.points,z),sb=span(points,z);if(Math.min(sa[1],sb[1])-Math.max(sa[0],sb[0])<=-margin){valid=false;break;}}
    const area=projectedOverlap(am.triangles,placed,k<2?[y,z]:[x,y]);if(area<=1e-12){valid=false;break;}overlaps.push(area);
    mapping.push({source_member_ref:am.member.id,replacement_member_ref:bm.member.id,source_feature_refs:am.member.feature_refs,replacement_feature_refs:bm.member.feature_refs});
   }
   if(!valid)continue;
   const placedSupport=b.support.triangles.map(t=>t.map(p=>point(pose,p))),treeA=finiteSurface(a.support.triangles),treeB=finiteSurface(placedSupport),sampledGap=Math.sqrt(Math.max(...a.support.triangles.flatMap(t=>[...t,mean(t)]).map(p=>surfaceDistanceSquared(p,treeB)),...placedSupport.flatMap(t=>[...t,mean(t)]).map(p=>surfaceDistanceSquared(p,treeA))));
   const result={source_interface_ref:source.id,replacement_interface_ref:replacement.id,rotation_replacement_to_source:r,translation_replacement_to_source:pose.t,member_mapping:mapping,comparison_margin_m:margin,assessment:'bounded_enclosure_contact_hypothesis',surface_conformity:'unconfirmed',measurements:{locating_span_m:wallWidth,rim_width_m:rimWidth,rim_length_m:rimLength,pairwise_projected_overlap_m2:overlaps,sampled_support_surface_gap_m:sampledGap},unresolved_conditions:['包覆曲面存在差异；弹性让位、预紧、保持和实际装入路径尚未核定']};
   result.id='interface-fit-hypothesis:'+createHash('sha256').update(JSON.stringify(result)).digest('hex');results.push(result);
  }
  return results;
 }
 return {match,regions:i=>profile(i)?.region?[profile(i).region]:null};
}
