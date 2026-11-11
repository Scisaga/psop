import {Box3,Matrix4,Vector3,type Camera} from 'three';

export type ScreenPoint={x:number;y:number};
export interface ScreenEnvelope {points:ScreenPoint[];min:ScreenPoint;max:ScreenPoint;center:ScreenPoint}
const cross=(a:ScreenPoint,b:ScreenPoint,c:ScreenPoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);

export function convexEnvelope(points:ScreenPoint[]):ScreenEnvelope|null {
  const sorted=points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).sort((a,b)=>a.x-b.x||a.y-b.y);
  const unique=sorted.filter((p,i)=>!i||p.x!==sorted[i-1].x||p.y!==sorted[i-1].y);
  if(!unique.length)return null;
  const lower:ScreenPoint[]=[],upper:ScreenPoint[]=[];
  for(const p of unique){while(lower.length>1&&cross(lower.at(-2)!,lower.at(-1)!,p)<=0)lower.pop();lower.push(p);}
  for(const p of [...unique].reverse()){while(upper.length>1&&cross(upper.at(-2)!,upper.at(-1)!,p)<=0)upper.pop();upper.push(p);}
  const hull=unique.length===1?unique:lower.slice(0,-1).concat(upper.slice(0,-1));
  const min={x:unique[0].x,y:Math.min(...unique.map(p=>p.y))},max={x:unique.at(-1)!.x,y:Math.max(...unique.map(p=>p.y))};
  return {points:hull,min,max,center:{x:(min.x+max.x)/2,y:(min.y+max.y)/2}};
}

/** Project the envelopes of all visible members, so either side can be an assembly. */
export function projectEnvelope(members:{bounds:Box3;matrix:Matrix4}[],camera:Camera,width:number,height:number){
  const points:ScreenPoint[]=[],v=new Vector3();
  for(const member of members)for(const x of [member.bounds.min.x,member.bounds.max.x])for(const y of [member.bounds.min.y,member.bounds.max.y])for(const z of [member.bounds.min.z,member.bounds.max.z]){
    v.set(x,y,z).applyMatrix4(member.matrix).project(camera);
    if(v.z>=-1&&v.z<=1)points.push({x:(v.x+1)*width/2,y:(1-v.y)*height/2});
  }
  const envelope=convexEnvelope(points);
  if(!envelope||envelope.max.x<0||envelope.min.x>width||envelope.max.y<0||envelope.min.y>height)return null;
  return envelope;
}

function pointSegment(p:ScreenPoint,a:ScreenPoint,b:ScreenPoint){
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
function contains(points:ScreenPoint[],p:ScreenPoint){return points.length>=3&&points.every((a,i)=>cross(a,points[(i+1)%points.length],p)>=-1e-7);}
function intersects(a:ScreenPoint,b:ScreenPoint,c:ScreenPoint,d:ScreenPoint){
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  if(abC*abD<0&&cdA*cdB<0)return true;
  return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b))<1e-7;
}
export function envelopeDistance(a:ScreenEnvelope,b:ScreenEnvelope){
  if(contains(a.points,b.points[0])||contains(b.points,a.points[0]))return 0;
  let gap=Infinity;
  for(let i=0;i<a.points.length;i++)for(let j=0;j<b.points.length;j++){
    const p=a.points[i],q=a.points[(i+1)%a.points.length],r=b.points[j],s=b.points[(j+1)%b.points.length];
    if(intersects(p,q,r,s))return 0;
    gap=Math.min(gap,pointSegment(p,r,s),pointSegment(r,p,q));
  }
  return gap;
}

export function boundsDistance(a:Box3,b:Box3){return Math.hypot(...(['x','y','z'] as const).map(k=>Math.max(0,a.min[k]-b.max[k],b.min[k]-a.max[k])));}

/** Require both physical approach and a small visible gap; projected overlap alone is not proximity. */
export function proximity(a:Box3,b:Box3,screenA:ScreenEnvelope|null,screenB:ScreenEnvelope|null,retained=false){
  const hysteresis=retained?1.35:1,extent=Math.min(a.getSize(new Vector3()).length(),b.getSize(new Vector3()).length());
  const worldThreshold=Math.max(.008,Math.min(.020,extent*.18))*hysteresis,screenThreshold=6*hysteresis;
  const worldGap=boundsDistance(a,b),screenGap=screenA&&screenB?envelopeDistance(screenA,screenB):Infinity;
  return {near:!!screenA&&!!screenB&&worldGap<=worldThreshold&&screenGap<=screenThreshold,worldGap,screenGap,score:Math.max(worldGap/worldThreshold,screenGap/screenThreshold)};
}
