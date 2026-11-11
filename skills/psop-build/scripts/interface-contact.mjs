/** Finite, source-local contact regions. No material properties or design clearances are invented. */
import {finiteSurface,surfaceDistanceSquared} from './finite-source-surface.mjs';
export const INTERFACE_CONTACT_METHOD='finite-interface-contact-regions/1';
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),sub=(a,b)=>a.map((v,k)=>v-b[k]);
const surfaces=new WeakMap();
export function interfaceContactRegions(contact,placement){
  if(!contact?.features?.every(side=>Array.isArray(side)&&side.length))return [];
  const transform=(p,vector=false)=>[placement[0]*p[0]+placement[4]*p[1]+placement[8]*p[2]+(vector?0:placement[12]/1000),placement[1]*p[0]+placement[5]*p[1]+placement[9]*p[2]+(vector?0:placement[13]/1000),placement[2]*p[0]+placement[6]*p[1]+placement[10]*p[2]+(vector?0:placement[14]/1000)];
  const regions=[];
  for(let side=0;side<2;side++)for(const g of contact.features[side]){
    if(g.type==='triangle_patch'){
      if(!g.triangles?.length||!g.triangles.every(t=>t.length===3&&t.every(p=>p.length===3&&p.every(Number.isFinite))))return [];
      regions.push({source_side:side?'b':'a',type:'triangle_patch',triangles:g.triangles.map(t=>t.map(p=>side?transform(p):p))});continue;
    }
    if(g.type==='oriented_box'){
      const vector=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
      if(!vector(g.origin)||g.axes?.length!==3||!g.axes.every(vector)||g.axes.some((a,k)=>Math.abs(dot(a,a)-1)>1e-8||g.axes.some((b,j)=>j!==k&&Math.abs(dot(a,b))>1e-8))||g.ranges?.length!==3||!g.ranges.every(r=>r.length===2&&r.every(Number.isFinite)&&r[0]<=r[1]))return [];
      regions.push({source_side:side?'b':'a',type:'oriented_box',origin_m:side?transform(g.origin):g.origin,axes:g.axes.map(a=>side?transform(a,true):a),ranges:g.ranges});continue;
    }
    if(!['cylinder','conical_frustum'].includes(g.type)||!g.origin?.every(Number.isFinite)||!g.axis?.every(Number.isFinite))return [];
    const length=Math.hypot(...g.axis),radius=g.type==='cylinder'?g.radius_m:Math.max(g.radius_start_m,g.radius_end_m),range=g.axial_range_m??[0,g.length_m];
    if(length<1e-12||!Number.isFinite(radius)||radius<=0||range?.length!==2||!range.every(Number.isFinite))return [];
    const origin=side?transform(g.origin):g.origin,axis=g.axis.map(v=>v/length);
    regions.push({source_side:side?'b':'a',origin_m:origin,axis:side?transform(axis,true):axis,radius_m:radius,axial_range_m:[Math.min(...range),Math.max(...range)]});
  }
  return regions;
}
export function distanceFromContactRegions(point,regions,margin=0){
  let distance=Infinity;
  for(const region of regions){
    if(region.type==='triangle_patch'){if(!surfaces.has(region))surfaces.set(region,finiteSurface(region.triangles));distance=Math.min(distance,Math.max(0,Math.sqrt(surfaceDistanceSquared(point,surfaces.get(region)))-margin));continue;}
    if(region.type==='oriented_box'){const delta=sub(point,region.origin_m);distance=Math.min(distance,Math.hypot(...region.axes.map((axis,k)=>{const v=dot(delta,axis),r=region.ranges[k];return Math.max(0,r[0]-margin-v,v-r[1]-margin);})));continue;}
    const delta=sub(point,region.origin_m),axial=dot(delta,region.axis),radial=Math.sqrt(Math.max(0,dot(delta,delta)-axial*axial));
    distance=Math.min(distance,Math.hypot(Math.max(0,radial-region.radius_m-margin),Math.max(0,region.axial_range_m[0]-margin-axial,axial-region.axial_range_m[1]-margin)));
  }
  return distance;
}
