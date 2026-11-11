/** Geometric substitution of complete finite interfaces, independent of part names and source partners.
 * A reference fit supplies complementary roles and a seat, never a replacement whitelist.
 * Exact substitutions preserve selected profiles; enclosing seats retain surface uncertainty.
 */
import {createHash} from 'node:crypto';
import {finiteSurface,sourceTriangles,surfaceDistanceSquared} from './finite-source-surface.mjs';
import {createBoundedInterfaceFits} from './bounded-interface-fit.mjs';
export const INTERFACE_ADAPTATION_METHOD='finite-source-interface-substitution/1';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sub=(a,b)=>a.map((v,k)=>v-b[k]),add=(a,b)=>a.map((v,k)=>v+b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),scale=(a,t)=>a.map(v=>v*t),norm=a=>Math.hypot(...a),unit=a=>norm(a)>1e-12?scale(a,1/norm(a)):null,cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],mean=ps=>[0,1,2].map(k=>ps.reduce((s,p)=>s+p[k],0)/ps.length);
const identity=()=>({r:[[1,0,0],[0,1,0],[0,0,1]],t:[0,0,0]}),rotate=(r,p)=>r.map(row=>dot(row,p)),point=(pose,p)=>add(rotate(pose.r,p),pose.t),inverse=pose=>{const r=pose.r[0].map((_,k)=>pose.r.map(row=>row[k]));return {r,t:scale(rotate(r,pose.t),-1)};},compose=(a,b)=>({r:a.r.map(row=>b.r[0].map((_,k)=>dot(row,b.r.map(r=>r[k])))),t:point(a,b.t)});
const finite=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const basis=(normal,edge)=>{const z=unit(normal);if(!z)return null;const x=unit(sub(edge,scale(z,dot(edge,z))));return x?[x,cross(z,x),z]:null;};
const rotation=(a,b)=>[0,1,2].map(i=>[0,1,2].map(j=>a.reduce((s,v,k)=>s+v[i]*b[k][j],0)));
const poseFor=part=>{const [x,y,z,w]=part.quaternion;return {r:[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]],t:part.position};};
const allowedBases=new Set(['source_fit','hypothesis','declared','source_assembly','inferred_fit']);
export function buildInterfaceAdaptations({parts,interfaces,features,connections,meshes,comparisonMargin=4e-5}){
 if(!Number.isFinite(comparisonMargin)||comparisonMargin<=0||comparisonMargin>.0001)throw Error('Invalid interface comparison precision');
 const partMap=new Map(parts.map(p=>[p.id,p])),featureMap=new Map(features.map(f=>[f.id,f])),interfaceMap=new Map(interfaces.map(i=>[i.id,i])),patches=new Map(),equivalences=new Map(),fits=new Map(),margin=comparisonMargin,cosine=Math.cos(Math.PI/600);
 const enclosing=createBoundedInterfaceFits({features:featureMap,meshes,parts:partMap,margin}),hypotheses=new Map();
 const profile=f=>{const g=f?.geometry;if(!g)return null;return ['source_region','plane'].includes(g.type)?'surface:'+f.kind:['cylinder','conical_frustum'].includes(g.type)?g.type+':'+f.kind:null;};
 const memberSignature=m=>JSON.stringify(m.feature_refs.map(ref=>profile(featureMap.get(ref))).sort());
 const interfaceSignature=i=>JSON.stringify(i.members.map(memberSignature).sort());
 function patch(f){
  if(patches.has(f.id))return patches.get(f.id);const bytes=meshes.get(f.owner_ref),triangles=bytes?sourceTriangles(bytes,f.geometry.triangle_indices):null;
  const value=triangles?.length?{triangles,tree:finiteSurface(triangles),samples:triangles.flatMap(t=>[...t,mean(t)]),area:triangles.reduce((s,t)=>s+norm(cross(sub(t[1],t[0]),sub(t[2],t[0])))/2,0)}:null;patches.set(f.id,value);return value;
 }
 function sameFeature(a,b,pose){
  if(!profile(a)||profile(a)!==profile(b))return false;const ga=a.geometry,gb=b.geometry;
  if(['source_region','plane'].includes(ga.type)){
   if(!finite(ga.normal)||!finite(gb.normal)||dot(unit(ga.normal)??[0,0,0],rotate(pose.r,unit(gb.normal)??[0,0,0]))<cosine)return false;
   const pa=patch(a),pb=patch(b);if(!pa||!pb||Math.abs(pa.area-pb.area)>Math.max(pa.area*.002,margin*Math.sqrt(pa.area)*4))return false;
   const back=inverse(pose);return pb.samples.every(p=>surfaceDistanceSquared(point(pose,p),pa.tree)<=margin**2)&&pa.samples.every(p=>surfaceDistanceSquared(point(back,p),pb.tree)<=margin**2);
  }
  const aa=unit(ga.axis??[]),ab=unit(gb.axis??[]),rangeA=ga.axial_range_m??[0,ga.length_m],rangeB=gb.axial_range_m??[0,gb.length_m];if(!aa||!ab||!rangeA.every(Number.isFinite)||!rangeB.every(Number.isFinite)||Math.abs(dot(aa,rotate(pose.r,ab)))<cosine)return false;
  const endsA=rangeA.map(t=>add(ga.origin,scale(aa,t))),endsB=rangeB.map(t=>point(pose,add(gb.origin,scale(ab,t))));const reversed=norm(sub(endsA[0],endsB[1]))<norm(sub(endsA[0],endsB[0]));if(reversed)endsB.reverse();
  const radiiA=ga.type==='cylinder'?[ga.radius_m,ga.radius_m]:[ga.radius_start_m,ga.radius_end_m],radiiB=gb.type==='cylinder'?[gb.radius_m,gb.radius_m]:[gb.radius_start_m,gb.radius_end_m];if(reversed)radiiB.reverse();
  return endsA.every((p,k)=>norm(sub(p,endsB[k]))<=margin&&Number.isFinite(radiiA[k])&&Number.isFinite(radiiB[k])&&Math.abs(radiiA[k]-radiiB[k])<=margin);
 }
 function matchFeatures(as,bs,pose){
  const used=new Set(),matches=[];
  function visit(n){if(n===as.length)return true;const a=featureMap.get(as[n]);for(const ref of bs){if(used.has(ref)||!sameFeature(a,featureMap.get(ref),pose))continue;used.add(ref);matches.push({source_feature_ref:a.id,replacement_feature_ref:ref});if(visit(n+1))return true;matches.pop();used.delete(ref);}return false;}
  return as.length===bs.length&&visit(0)?matches:null;
 }
 function equivalent(a,b){
  if(a.owner_ref===b.owner_ref||a.members.length<2||interfaceSignature(a)!==interfaceSignature(b))return [];
  const pa=partMap.get(a.owner_ref),pb=partMap.get(b.owner_ref);if([pa,pb].some(p=>!p||p.scale?.some(v=>Math.abs(v-1)>1e-10)))return [];
  const anchor=a.members[0],second=a.members.find(m=>m!==anchor&&basis(anchor.direction,sub(m.position,anchor.position)));if(!second)return [];
  const frame=basis(anchor.direction,sub(second.position,anchor.position)),results=new Map();
  for(const first of b.members){if(memberSignature(anchor)!==memberSignature(first))continue;for(const next of b.members){
   if(next===first||memberSignature(second)!==memberSignature(next)||Math.abs(norm(sub(second.position,anchor.position))-norm(sub(next.position,first.position)))>2*margin)continue;
   const targetFrame=basis(first.direction,sub(next.position,first.position));if(!targetFrame)continue;const r=rotation(frame,targetFrame),pose={r,t:sub(anchor.position,rotate(r,first.position))},used=new Set(),mapping=[];
   function visit(n){if(n===a.members.length)return true;const am=a.members[n];for(const bm of b.members){if(used.has(bm.id)||memberSignature(am)!==memberSignature(bm)||norm(sub(am.position,point(pose,bm.position)))>margin||dot(unit(am.direction),rotate(r,unit(bm.direction)))<cosine)continue;
    const fs=matchFeatures(am.feature_refs,bm.feature_refs,pose);if(!fs)continue;used.add(bm.id);mapping.push({source_member_ref:am.id,replacement_member_ref:bm.id,features:fs});if(visit(n+1))return true;mapping.pop();used.delete(bm.id);}return false;}
   if(!visit(0))continue;const key=JSON.stringify([r.flat().map(v=>Math.round(v*1e10)),pose.t.map(v=>Math.round(v*1e10)),mapping]);if(!results.has(key))results.set(key,{source_interface_ref:a.id,replacement_interface_ref:b.id,rotation_replacement_to_source:r,translation_replacement_to_source:pose.t,member_mapping:structuredClone(mapping),comparison_margin_m:margin});
  }}return [...results.values()];
 }
 const seeds=connections.filter(c=>allowedBases.has(c.basis)&&c.endpoints?.length===2&&c.endpoints.every(e=>e.member_refs?.length>=2&&interfaceMap.has(e.interface_ref))).filter(c=>c.endpoints.some(e=>e.member_refs.some(ref=>interfaceMap.get(e.interface_ref).members.find(m=>m.id===ref)?.feature_refs.some(f=>['source_region','plane'].includes(featureMap.get(f)?.geometry.type))))).sort((a,b)=>a.id.localeCompare(b.id));
 const eligible=interfaces.filter(i=>i.members.length>=2&&i.members.every(m=>finite(m.position)&&finite(m.direction)&&norm(m.direction)>1e-12&&m.feature_refs?.length&&m.feature_refs.every(ref=>profile(featureMap.get(ref))))),bySignature=new Map();for(const i of eligible){const key=interfaceSignature(i);if(!bySignature.has(key))bySignature.set(key,[]);bySignature.get(key).push(i);}
 function replacements(endpoint){
  const original=interfaceMap.get(endpoint.interface_ref),selected={...original,members:endpoint.member_refs.map(ref=>original.members.find(m=>m.id===ref))};if(selected.members.some(m=>!m)||!eligible.some(i=>i.id===original.id))return [];
  const unchanged={source_interface_ref:original.id,replacement_interface_ref:original.id,rotation_replacement_to_source:identity().r,translation_replacement_to_source:[0,0,0],member_mapping:selected.members.map(m=>({source_member_ref:m.id,replacement_member_ref:m.id,features:m.feature_refs.map(ref=>({source_feature_ref:ref,replacement_feature_ref:ref}))}))};
  const result=[unchanged],exact=new Set();for(const other of bySignature.get(interfaceSignature(selected))??[])for(const eq of equivalent(selected,other)){eq.id='interface-equivalence:'+hash(eq);equivalences.set(eq.id,eq);result.push(eq);exact.add(other.id);}
  if(selected.members.length===4)for(const other of eligible){if(exact.has(other.id))continue;for(const fit of enclosing.match(selected,other)){hypotheses.set(fit.id,fit);result.push(fit);}}return result;
 }
 const originals=new Set(connections.filter(c=>c.endpoints?.length===2).map(c=>c.endpoints.map(e=>e.interface_ref).sort().join('|')));
 function contactFeatures(i,members){return [...new Set(members.flatMap(m=>i.members.find(v=>v.id===m).feature_refs))].sort().map(ref=>{const f=featureMap.get(ref),g=f.geometry;if(['source_region','plane'].includes(g.type)){const p=patch(f);return p?{type:'triangle_patch',triangles:p.triangles}:null;}return {type:g.type,origin:g.origin,axis:g.axis,axial_range_m:g.axial_range_m??[0,g.length_m],...(g.type==='cylinder'?{radius_m:g.radius_m}:{radius_start_m:g.radius_start_m,radius_end_m:g.radius_end_m})};});}
 for(const seed of seeds){
  const choices=seed.endpoints.map(replacements),sourceInterfaces=seed.endpoints.map(e=>interfaceMap.get(e.interface_ref)),sourcePose=compose(inverse(poseFor(partMap.get(sourceInterfaces[0].owner_ref))),poseFor(partMap.get(sourceInterfaces[1].owner_ref)));
  for(const ea of choices[0])for(const eb of choices[1]){
   const is=[ea,eb].map(e=>interfaceMap.get(e.replacement_interface_ref));if(is[0].owner_ref===is[1].owner_ref||originals.has(is.map(i=>i.id).sort().join('|')))continue;
   let eqs=[ea,eb],pose=compose(compose(inverse({r:ea.rotation_replacement_to_source,t:ea.translation_replacement_to_source}),sourcePose),{r:eb.rotation_replacement_to_source,t:eb.translation_replacement_to_source});
   const representative=m=>m.features?.[0]?.replacement_feature_ref??m.replacement_feature_refs[0];
   const memberPairs=[];for(const am of ea.member_mapping){const suffix=am.source_member_ref.slice(sourceInterfaces[0].id.length),bm=eb.member_mapping.find(m=>m.source_member_ref.slice(sourceInterfaces[1].id.length)===suffix);if(bm)memberPairs.push({member_a_ref:am.replacement_member_ref,member_b_ref:bm.replacement_member_ref,feature_a_ref:representative(am),feature_b_ref:representative(bm)});}
   if(is[0].owner_ref>is[1].owner_ref){is.reverse();eqs.reverse();pose=inverse(pose);for(const p of memberPairs){[p.member_a_ref,p.member_b_ref]=[p.member_b_ref,p.member_a_ref];[p.feature_a_ref,p.feature_b_ref]=[p.feature_b_ref,p.feature_a_ref];}}
   const bounded=eqs.some(e=>e.assessment==='bounded_enclosure_contact_hypothesis'),endpoints=is.map((i,n)=>({interface_ref:i.id,member_refs:eqs[n].member_mapping.map(m=>m.replacement_member_ref)})),contact=endpoints.map((e,n)=>bounded?enclosing.regions({...is[n],members:e.member_refs.map(ref=>is[n].members.find(m=>m.id===ref))}):contactFeatures(is[n],e.member_refs));if(contact.some(side=>!side?.length||side.some(g=>!g)))continue;
   const key=JSON.stringify([endpoints.map(e=>({...e,member_refs:[...e.member_refs].sort()})),pose.r.flat().map(v=>Math.round(v*1e10)),pose.t.map(v=>Math.round(v*1e10))]);
   if(!fits.has(key)){const fit={owner_refs:is.map(i=>i.owner_ref),endpoints,member_pairs:memberPairs,title:seed.name,registration:{rotation_b_to_a:pose.r,translation_b_to_a:pose.t,comparison_margin_m:margin,whole_part_collision_evaluated:false},anchors:endpoints.map((e,n)=>mean(e.member_refs.map(ref=>is[n].members.find(m=>m.id===ref).position))),marker_points:endpoints.map((e,n)=>e.member_refs.map(ref=>is[n].members.find(m=>m.id===ref).position)),contact_features:contact,source_connection_refs:[],equivalence_refs:[],interface_fit_hypothesis_refs:[],...(bounded?{adaptation_kind:'bounded_enclosure_contact_hypothesis',surface_conformity:'unconfirmed'}:{}),evidence_refs:[...new Set([...seed.evidence_refs??[],...is.flatMap(i=>i.evidence_refs??[])])].sort(),conditions:[bounded?'有限定位壁与杯口适配；包覆曲面、弹性让位、预紧、保持和实际装入路径尚未核定':'接口形状与原装配合对应；实际保持、装入路径和承载尚未核定']};fit.id='interface-adaptation:'+hash(key);fits.set(key,fit);}
   const fit=fits.get(key);fit.source_connection_refs=[...new Set([...fit.source_connection_refs,seed.id])].sort();fit.equivalence_refs=[...new Set([...fit.equivalence_refs,...eqs.filter(e=>!e.assessment).map(e=>e.id).filter(Boolean)])].sort();fit.interface_fit_hypothesis_refs=[...new Set([...fit.interface_fit_hypothesis_refs,...eqs.filter(e=>e.assessment).map(e=>e.id)])].sort();fit.evidence_refs=[...new Set([...fit.evidence_refs,...seed.evidence_refs??[]])].sort();fit.source_conditions=[...new Set([...fit.source_conditions??[],seed.note,...is.flatMap(i=>i.unresolved_conditions??[]),...eqs.flatMap(e=>e.unresolved_conditions??[])].filter(Boolean))].sort();
  }
 }
 return {schema:'psop.interface-adaptations/1',method:INTERFACE_ADAPTATION_METHOD,comparison_margin_m:margin,scope:'Finite selected interfaces with captured complementary reference fits; exact surface substitutions and separately recorded bounded enclosure contact hypotheses; proper rigid transforms only; no whole-part, path, retention or mechanics certification',reference_fit_count:seeds.length,equivalences:[...equivalences.values()].sort((a,b)=>a.id.localeCompare(b.id)),interface_fit_hypotheses:[...hypotheses.values()].sort((a,b)=>a.id.localeCompare(b.id)),fits:[...fits.values()].sort((a,b)=>a.id.localeCompare(b.id))};
}
