import {Box3,Vector3} from 'three';

const point=a=>new Vector3().fromArray(a);
/** Slab intersection against open boxes: touching a clearance boundary is allowed. */
export function segmentHitsBox(a,b,box){
 let lo=0,hi=1;
 for(let k=0;k<3;k++){const start=a.getComponent(k),delta=b.getComponent(k)-start,min=box.min.getComponent(k)+1e-8,max=box.max.getComponent(k)-1e-8;if(Math.abs(delta)<1e-12){if(start<=min||start>=max)return false;}else{const x=(min-start)/delta,y=(max-start)/delta;lo=Math.max(lo,Math.min(x,y));hi=Math.min(hi,Math.max(x,y));if(lo>=hi)return false;}}
 return hi>0&&lo<1;
}

/** Fixed-orientation translation, using Minkowski boxes and a corner visibility graph. */
export function routeAroundBoxes(from,to,moving,obstacles,{gap=.0015,floor=.0001}={}){
 const boxes=obstacles.map(box=>new Box3(box.min.clone().sub(moving.max).addScalar(-gap),box.max.clone().sub(moving.min).addScalar(gap))),a=point(from),b=point(to),clear=(x,y)=>!boxes.some(box=>segmentHitsBox(x,y,box));
 if(a.z+moving.min.z<floor-1e-7||b.z+moving.min.z<floor-1e-7)return null;
 if(clear(a,b))return [from,to];
 const nodes=[a,b],limit=new Box3().setFromPoints([a,b]).expandByScalar(.35),unique=new Set([a.toArray().join(','),b.toArray().join(',')]);
 for(const box of boxes){if(!box.intersectsBox(limit))continue;for(const x of [box.min.x-.0001,box.max.x+.0001])for(const y of [box.min.y-.0001,box.max.y+.0001])for(const z of [box.min.z-.0001,box.max.z+.0001]){
  if(z+moving.min.z<floor)continue;const p=new Vector3(x,y,z),key=p.toArray().map(n=>Math.round(n*1e7)).join(',');if(unique.has(key)||boxes.some(o=>o.containsPoint(p)))continue;unique.add(key);nodes.push(p);
 }}
 const distances=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),done=new Set();distances[0]=0;
 while(done.size<nodes.length){let n=-1;for(let k=0;k<nodes.length;k++)if(!done.has(k)&&(n<0||distances[k]<distances[n]))n=k;if(n<0||!Number.isFinite(distances[n]))return null;if(n===1)break;done.add(n);
  for(let k=0;k<nodes.length;k++){if(done.has(k))continue;const cost=distances[n]+nodes[n].distanceTo(nodes[k]);if(cost>=distances[k]||!clear(nodes[n],nodes[k]))continue;distances[k]=cost;previous[k]=n;}
 }
 const result=[];for(let n=1;n>=0;n=previous[n])result.push(nodes[n].toArray());return result.reverse();
}

export function timedWaypoints(poses,{insertionStart}={}){
 const clean=poses.filter((p,n)=>!n||point(p.position).distanceTo(point(poses[n-1].position))>1e-8||p.quaternion.some((v,k)=>Math.abs(v-poses[n-1].quaternion[k])>1e-8));
 if(clean.length===1)return [{at:0,...clean[0]},{at:1,...clean[0]}];
 const cost=clean.map((p,n)=>n?Math.max(.003,point(p.position).distanceTo(point(clean[n-1].position))+(1-Math.abs(p.quaternion.reduce((v,q,k)=>v+q*clean[n-1].quaternion[k],0)))*.12):0),total=cost.reduce((a,b)=>a+b,0);let sum=0;
 const route=clean.map((p,n)=>{sum+=cost[n];return {at:n===clean.length-1?1:sum/total,...p};});
 // Give the short, mechanically meaningful entry at least 30% of its shot.
 if(insertionStart){const index=clean.findIndex(p=>point(p.position).distanceTo(point(insertionStart.position))<1e-7&&p.quaternion.every((v,k)=>Math.abs(v-insertionStart.quaternion[k])<1e-7));if(index>0&&index<route.length-1){const split=route[index].at;for(let n=0;n<route.length;n++)route[n].at=n<=index?route[n].at/split*.7:.7+(route[n].at-split)/(1-split)*.3;}}
 return route;
}
