import {Box3,Matrix4,Quaternion,Vector3} from 'three';
import type {SimulationPose} from './simulate-types';

export const CONNECTION_TIMING={approach:320,join:760,hold:220,return:360};
export const CONNECTION_DURATION=Object.values(CONNECTION_TIMING).reduce((a,b)=>a+b,0);
export const ease=(t:number)=>{const v=Math.max(0,Math.min(1,t));return v*v*(3-2*v);};
const asMatrix=(pose:SimulationPose)=>new Matrix4().compose(new Vector3().fromArray(pose.position),new Quaternion().fromArray(pose.quaternion),new Vector3(1,1,1));

/** Interpolate one anchor, then apply its world delta to every member: groups stay rigid throughout. */
export function rigidMotion(from:SimulationPose,to:SimulationPose,startMatrices:Map<string,Matrix4>,progress:number,offset=new Vector3(),lift=0){
  const t=Math.max(0,Math.min(1,progress)),position=new Vector3().fromArray(from.position).lerp(new Vector3().fromArray(to.position),ease(t));
  position.addScaledVector(offset,Math.sin(Math.PI*t));position.z+=Math.sin(Math.PI*t)*lift;
  const rotation=new Quaternion().fromArray(from.quaternion).slerp(new Quaternion().fromArray(to.quaternion),ease(t));
  const delta=new Matrix4().compose(position,rotation,new Vector3(1,1,1)).multiply(asMatrix(from).invert());
  return new Map([...startMatrices].map(([id,m])=>[id,delta.clone().multiply(m)]));
}

export type MotionWaypoint={at:number;pose:SimulationPose};
/** Lift clear, align outside the shaft end, then translate coaxially without rotation or an arc. */
export function axialRoute(from:SimulationPose,to:SimulationPose,offset:number[],lift=.04,host?:Box3,moving?:Box3):MotionWaypoint[]{
 const entry:SimulationPose={position:new Vector3().fromArray(to.position).add(new Vector3().fromArray(offset)).toArray(),quaternion:to.quaternion};
 const height=Math.max(from.position[2],entry.position[2],to.position[2],host&&moving?host.max.z-moving.min.z:0)+lift;
 const raised:SimulationPose={position:[from.position[0],from.position[1],height],quaternion:from.quaternion};
 if(host&&moving){
  const forbidden=new Box3(host.min.clone().sub(moving.max).addScalar(-.006),host.max.clone().sub(moving.min).addScalar(.006)),p=new Vector3().fromArray(entry.position);
  if(p.z<forbidden.min.z&&p.x>forbidden.min.x&&p.x<forbidden.max.x&&p.y>forbidden.min.y&&p.y<forbidden.max.y){
   // A bearing entering from below must go around the support before passing underneath it.
   const side=[forbidden.min.x-.005,forbidden.max.x+.005].sort((a,b)=>Math.abs(a-from.position[0])+Math.abs(a-p.x)-Math.abs(b-from.position[0])-Math.abs(b-p.x))[0];
   return [{at:0,pose:from},{at:.15,pose:raised},{at:.35,pose:{position:[side,p.y,height],quaternion:to.quaternion}},{at:.55,pose:{position:[side,p.y,p.z],quaternion:to.quaternion}},{at:.7,pose:entry},{at:1,pose:to}];
  }
 }
 return [{at:0,pose:from},{at:.2,pose:raised},{at:.5,pose:{position:[entry.position[0],entry.position[1],height],quaternion:to.quaternion}},{at:.7,pose:entry},{at:1,pose:to}];
}

export function waypointMotion(route:MotionWaypoint[],startMatrices:Map<string,Matrix4>,progress:number){
 const t=Math.max(0,Math.min(1,progress)),index=Math.max(1,route.findIndex(p=>p.at>=t)),a=route[index-1],b=route[index];
 const at=rigidMotion(route[0].pose,a.pose,startMatrices,1);return rigidMotion(a.pose,b.pose,at,(t-a.at)/(b.at-a.at));
}

export function connectionProgress(elapsed:number){
  const a=CONNECTION_TIMING.approach,b=a+CONNECTION_TIMING.join,c=b+CONNECTION_TIMING.hold;
  return {phase:elapsed<a?'approach':elapsed<b?'join':elapsed<c?'hold':'return',approach:ease(elapsed/a),join:ease((elapsed-a)/CONNECTION_TIMING.join),cameraReturn:ease((elapsed-c)/CONNECTION_TIMING.return),done:elapsed>=CONNECTION_DURATION} as const;
}
