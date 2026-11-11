import {Box3,MathUtils,PerspectiveCamera,Quaternion,Ray,Vector3} from 'three';

export type AssemblyCameraView={position:Vector3;target:Vector3};

/** Arc around the subject while dollying, instead of cutting through it on a straight chord. */
export function blendAssemblyView(from:AssemblyCameraView,to:AssemblyCameraView,t:number):AssemblyCameraView{
  const progress=MathUtils.clamp(t,0,1),a=from.position.clone().sub(from.target),b=to.position.clone().sub(to.target),ra=Math.max(.001,a.length()),rb=Math.max(.001,b.length());a.normalize();b.normalize();
  const turn=new Quaternion().setFromUnitVectors(a,b),rotation=new Quaternion().slerp(turn,progress),direction=a.applyQuaternion(rotation),radius=Math.exp(MathUtils.lerp(Math.log(ra),Math.log(rb),progress)),target=from.target.clone().lerp(to.target,progress);
  return {target,position:target.clone().addScaledVector(direction,radius)};
}

/** Fit all eight corners, including the vertical area reserved for cinematic controls. */
export function frameAssemblyShot(box:Box3,camera:PerspectiveCamera,direction:Vector3,margin=1.28):AssemblyCameraView{
  const target=box.getCenter(new Vector3()),forward=direction.clone().normalize(),right=new Vector3().crossVectors(camera.up,forward).normalize(),up=new Vector3().crossVectors(forward,right).normalize();
  const ty=Math.tan(MathUtils.degToRad(camera.fov/2))*.8,tx=ty*camera.aspect;let distance=.065;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new Vector3(x,y,z).sub(target);distance=Math.max(distance,p.dot(forward)+Math.abs(p.dot(right))*margin/tx,p.dot(forward)+Math.abs(p.dot(up))*margin/ty);}
  return {position:target.clone().addScaledVector(forward,distance),target};
}

/** Prefer a clear, nearby shot over a view through another part. No work runs per animation frame. */
export function chooseAssemblyShot(box:Box3,occluders:Box3[],camera:PerspectiveCamera,current:AssemblyCameraView,preferred?:Vector3):AssemblyCameraView{
  const target=box.getCenter(new Vector3()),previous=current.position.clone().sub(current.target).normalize(),bias=preferred?.clone().normalize()??previous,choices=[];
  const points=[target,...[-1,1].flatMap(x=>[-1,1].map(y=>target.clone().add(new Vector3(x*.35,y*.35,.2).multiply(box.getSize(new Vector3())))))];
  for(let n=0;n<12;n++)for(const elevation of [.42,.72,1.05]){
    const angle=n*Math.PI/6,direction=new Vector3(Math.cos(angle),Math.sin(angle),elevation).normalize(),view=frameAssemblyShot(box,camera,direction);
    let blocks=0;
    for(const point of points){const ray=new Ray(view.position,point.clone().sub(view.position).normalize()),distance=view.position.distanceTo(point);for(const obstacle of occluders){const hit=ray.intersectBox(obstacle,new Vector3());if(hit&&hit.distanceTo(view.position)<distance-.002)blocks++;}}
    const continuity=1-direction.dot(previous),approach=1-direction.dot(bias);choices.push({view,score:blocks*2.5+continuity*.8+approach*.35+Math.abs(elevation-.72)*.08});
  }
  choices.sort((a,b)=>a.score-b.score);return choices[0].view;
}
