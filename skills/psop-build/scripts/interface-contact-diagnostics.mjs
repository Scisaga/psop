/** Bounded surface samples + exact point-to-triangle distances. This is not a maximum-depth certificate. */
import {INTERFACE_CONTACT_METHOD,interfaceContactRegions,distanceFromContactRegions} from './interface-contact.mjs';
const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const add=(a,b,t)=>a.map((v,k)=>v+t*b[k]);
const square=(a,b)=>dot(sub(a,b),sub(a,b));
function closest(p,a,b,c){
  const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);
  if(d1<=0&&d2<=0)return a;
  const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return b;
  const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0)return add(a,ab,d1/(d1-d3));
  const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return c;
  const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0)return add(a,ac,d2/(d2-d6));
  const va=d3*d6-d5*d4;if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0)return add(b,sub(c,b),(d4-d3)/((d4-d3)+(d5-d6)));
  const den=va+vb+vc;if(Math.abs(den)<1e-28)return [a,b,c].sort((x,y)=>square(p,x)-square(p,y))[0];
  return add(add(a,ab,vb/den),ac,vc/den);
}
const transform=(p,e)=>[e[0]*p[0]+e[4]*p[1]+e[8]*p[2]+e[12],e[1]*p[0]+e[5]*p[1]+e[9]*p[2]+e[13],e[2]*p[0]+e[6]*p[1]+e[10]*p[2]+e[14]];
const untransform=(p,e)=>{const d=[p[0]-e[12],p[1]-e[13],p[2]-e[14]];return [e[0]*d[0]+e[1]*d[1]+e[2]*d[2],e[4]*d[0]+e[5]*d[1]+e[6]*d[2],e[8]*d[0]+e[9]*d[1]+e[10]*d[2]];};
const sourceGeometries=new WeakMap();
function tree(triangles){
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const t of triangles)for(const p of t.points)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}
  if(triangles.length<=12)return {lo,hi,triangles};
  const axis=[0,1,2].sort((a,b)=>(hi[b]-lo[b])-(hi[a]-lo[a]))[0];triangles.sort((a,b)=>a.center[axis]-b.center[axis]);const mid=triangles.length>>1;
  return {lo,hi,children:[tree(triangles.slice(0,mid)),tree(triangles.slice(mid))]};
}
const boxDistance=(p,node)=>p.reduce((s,v,k)=>s+Math.max(node.lo[k]-v,0,v-node.hi[k])**2,0);
function nearest(p,node,best={distance2:Infinity}){
  if(boxDistance(p,node)>=best.distance2)return best;
  if(node.triangles){for(const t of node.triangles){const q=closest(p,...t.points),d=square(p,q);if(d<best.distance2)best={distance2:d,point:q,triangle:t.id};}return best;}
  for(const child of [...node.children].sort((a,b)=>boxDistance(p,a)-boxDistance(p,b)))best=nearest(p,child,best);return best;
}
function sourceGeometry(mesh){
  if(sourceGeometries.has(mesh))return sourceGeometries.get(mesh);
  const points=mesh.vertices;
  const triangles=[];for(let n=0;n<mesh.triangles.length;n+=3){const ps=mesh.triangles.slice(n,n+3).map(i=>points[i]);triangles.push({id:n/3,points:ps,center:[0,1,2].map(k=>ps.reduce((s,p)=>s+p[k],0)/3)});}
  const geometry={triangles,tree:tree([...triangles])};sourceGeometries.set(mesh,geometry);return geometry;
}
export function contactDiagnostics({a,b,placed,meshes,shaA,shaB,placement,components,interfaceContact,maxTriangles=2048}){
  const ga=sourceGeometry(meshes[0]),gb=sourceGeometry(meshes[1]),witnesses=[];let maximum=0,sampleCount=0,insideCount=0;
  const regions=interfaceContactRegions(interfaceContact,placement),contactWitnesses=[],margin=interfaceContact?.comparison_margin_m??0;let contactViolation=0,stoppedEarly=false;
  samples:for(const [from,to,target,side]of [[ga,gb,placed,'a'],[gb,ga,a,'b']]){
    const stride=Math.max(1,Math.ceil(from.triangles.length/maxTriangles));
    for(let n=0;n<from.triangles.length;n+=stride){const triangle=from.triangles[n];for(const local of [...triangle.points,triangle.center]){
      // Rigid transforms preserve distances. Query the cached source-local BVH.
      const p=side==='b'?transform(local,placement):local,query=side==='a'?untransform(p,placement):p;
      sampleCount++;if(query.some((v,k)=>v<to.tree.lo[k]||v>to.tree.hi[k]))continue;
      const end=add(p,[.917,.331,.223],10000),hit=target.rayCast(p,end).find(h=>h.distance>1e-10);
      if(!hit||dot(hit.normal,sub(end,p))<=0)continue;
      const near=nearest(query,to.tree),surface=side==='a'?transform(near.point,placement):near.point,depth=Math.sqrt(near.distance2);insideCount++;
      if(depth>maximum){maximum=depth;witnesses.unshift({point_m:p.map(v=>v/1000),nearest_surface_point_m:surface.map(v=>v/1000),depth_m:depth/1000,source_side:side,source_triangle:triangle.id,opposing_triangle:near.triangle});witnesses.length=Math.min(8,witnesses.length);}
      if(regions.length){
        const point=p.map(v=>v/1000),outside=distanceFromContactRegions(point,regions,margin),violation=Math.min(depth/1000,outside);
        if(violation>contactViolation){contactViolation=violation;contactWitnesses.unshift({point_m:point,nearest_surface_point_m:surface.map(v=>v/1000),depth_m:depth/1000,outside_contact_distance_m:outside,source_side:side,source_triangle:triangle.id,opposing_triangle:near.triangle});contactWitnesses.length=Math.min(8,contactWitnesses.length);}
        if(Number.isFinite(interfaceContact.stop_after_obstruction_m)&&violation>interfaceContact.stop_after_obstruction_m){stoppedEarly=true;break samples;}
      }
    }}
  }
  return {schema:'psop.solid-contact-diagnostics/1',method:'finite-source-surface-samples-nearest-triangle-bvh/1',coordinate_frame:'source_a',sample_count:sampleCount,interior_sample_count:insideCount,
    sampled_penetration_depth_m:maximum/1000,depth_scope:'sampled_surface_points_only_not_certified_maximum',source_sha256:[shaA,shaB],witnesses,
    ...(interfaceContact?{interface_contact:{method:INTERFACE_CONTACT_METHOD,status:regions.length?'sampled':'not_evaluated',coordinate_frame:'source_a',comparison_margin_m:margin,regions,sampling_stopped_after_obstruction:stoppedEarly,sampled_clearance_violation_m:contactViolation,witnesses:contactWitnesses}}:{}),
    components:components.map(c=>{const mesh=c.getMesh(),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<mesh.vertProperties.length;i+=mesh.numProp)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],mesh.vertProperties[i+k]/1000);hi[k]=Math.max(hi[k],mesh.vertProperties[i+k]/1000);}return {intersection_volume_m3:c.volume()/1e9,bounds_m:[lo,hi]};})};
}
