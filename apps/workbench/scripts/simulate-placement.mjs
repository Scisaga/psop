import {Box3,Vector3} from 'three';
import {clone,groupsFor,layoutInstances,transformedBounds,validPose} from './simulate-core.mjs';

export function tableFor(parts,bounds,orientations={}){
  const byPart=new Map(parts.map(p=>[p.id,p])),box=new Box3();
  for(const p of layoutInstances(parts,bounds,orientations))box.union(transformedBounds(bounds[p.part_ref],p,byPart.get(p.part_ref).scale));
  const size=box.getSize(new Vector3());return {width:Math.max(1,size.x+.26),height:Math.max(.65,size.y+.23)};
}

/** Display tools reserve desktop space without entering assembly inventory. */
export function tableReservations({width:w,height:h}){
  const rect=(x,y,hw,hh)=>({min:{x:x-hw,y:y-hh},max:{x:x+hw,y:y+hh}});
  // Caliper bounds include the open jaws, depth rod and slight in-plane rotation.
  // Match the display layout in src/simulate-workbench-tools.ts.
  return [rect(w*.22,h*.45,.061,.032),rect(w*.43,-h*.31,.066,.052),rect(-w*.5+.132,-h*.5+.066,.137,.049)];
}

/** Nearest empty rectangle among finite axis-aligned obstacles; no sampling can skip a narrow free slot. */
export function nearestTablePosition(box,obstacles,table,gap=.012){
  const size=box.getSize(new Vector3()),center=box.getCenter(new Vector3()),hx=size.x/2,hy=size.y/2;
  const minX=-table.width/2+.015+hx,maxX=table.width/2-.015-hx,minY=-table.height/2+.015+hy,maxY=table.height/2-.015-hy;
  if(minX>maxX||minY>maxY)return null;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),xs=new Set([clamp(center.x,minX,maxX),minX,maxX]),ys=new Set([clamp(center.y,minY,maxY),minY,maxY]);
  for(const b of obstacles){for(const x of [b.min.x-hx-gap,b.max.x+hx+gap])if(x>=minX&&x<=maxX)xs.add(x);for(const y of [b.min.y-hy-gap,b.max.y+hy+gap])if(y>=minY&&y<=maxY)ys.add(y);}
  let best=null,bestDistance=Infinity;
  for(const x of xs)for(const y of ys){
    const distance=(x-center.x)**2+(y-center.y)**2;if(distance>=bestDistance-1e-14)continue;
    if(obstacles.some(b=>x+hx+gap>b.min.x+1e-9&&x-hx-gap<b.max.x-1e-9&&y+hy+gap>b.min.y+1e-9&&y-hy-gap<b.max.y-1e-9))continue;
    best={x,y,z:.0002-box.min.z};bestDistance=distance;
  }
  return best;
}

/** Keep the larger component. On ties, keep the connection's fixed-target side. */
export function settleDisconnected(session,connection,context){
  const groups=groupsFor(session.instances,session.connections),a=groups.find(g=>g.instance_ids.includes(connection.endpoints[0].instance_id)),b=groups.find(g=>g.instance_ids.includes(connection.endpoints[1].instance_id));
  if(a.id===b.id)return {instances:session.instances,operation:{type:'disconnect',status:'still_connected',moving_instance_ids:[],stationary_instance_ids:a.instance_ids}};
  const stationary=a.instance_ids.length>b.instance_ids.length?a:b,moving=stationary===a?b:a,ids=new Set(moving.instance_ids),boxes=new Map(session.instances.map(p=>[p.id,transformedBounds(context.bounds[p.part_ref],p,context.partMap.get(p.part_ref).scale)])),box=new Box3();
  for(const id of ids)box.union(boxes.get(id));
  const obstacles=[...boxes].filter(([id])=>!ids.has(id)).map(([,b])=>b).concat(tableReservations(context.table));
  const spot=nearestTablePosition(box,obstacles,context.table),operation={type:'disconnect',status:spot?'placed':'no_space',moving_instance_ids:moving.instance_ids,stationary_instance_ids:stationary.instance_ids};
  if(!spot)return {instances:session.instances,operation};
  const center=box.getCenter(new Vector3()),delta=[spot.x-center.x,spot.y-center.y,spot.z];
  const instances=session.instances.map(p=>{if(!ids.has(p.id))return p;const next={...clone(p),position:p.position.map((v,n)=>v+delta[n])};validPose(next);return next;});
  return {instances,operation:{...operation,translation:delta,clearance_m:.012}};
}
