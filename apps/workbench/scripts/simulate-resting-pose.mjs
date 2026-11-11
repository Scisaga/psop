import {Box3,Matrix4,Quaternion,Vector3} from 'three';

/** Area of actual source triangles on each of the six local bounding faces. */
export function stlSupportAreas(bytes,bounds){
  const areas=Array(6).fill(0),count=bytes.readUInt32LE(80),tolerance=2e-5;
  const a=new Vector3(),b=new Vector3(),c=new Vector3(),ab=new Vector3(),ac=new Vector3();
  for(let n=0;n<count;n++){
    const offset=84+n*50+12;
    a.set(...[0,1,2].map(k=>bytes.readFloatLE(offset+k*4)));
    b.set(...[0,1,2].map(k=>bytes.readFloatLE(offset+12+k*4)));
    c.set(...[0,1,2].map(k=>bytes.readFloatLE(offset+24+k*4)));
    const area=ab.subVectors(b,a).cross(ac.subVectors(c,a)).length()/2;
    for(let axis=0;axis<3;axis++)for(let side=0;side<2;side++){
      if([a,b,c].every(v=>Math.abs(v.getComponent(axis)-bounds[side][axis])<=tolerance))areas[axis*2+side]+=area;
    }
  }
  return areas;
}

/** A deterministic display pose: low height, broad downward face, then least source rotation. */
export function restingQuaternion(part,bounds,supportAreas){
  const original=new Quaternion().fromArray(part.quaternion).normalize(),up=new Vector3(0,0,1),scale=part.scale??[1,1,1];
  const candidates=[original];
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
    const normal=new Vector3().setComponent(axis,sign).applyQuaternion(original);
    candidates.push(new Quaternion().setFromUnitVectors(normal,up).multiply(original).normalize());
  }
  let best;
  for(const q of candidates){
    const box=new Box3(new Vector3().fromArray(bounds[0]),new Vector3().fromArray(bounds[1])).applyMatrix4(new Matrix4().compose(new Vector3(),q,new Vector3().fromArray(scale)));
    const down=new Vector3(0,0,-1).applyQuaternion(q.clone().invert());
    const axis=[0,1,2].sort((a,b)=>Math.abs(down.getComponent(b))-Math.abs(down.getComponent(a)))[0];
    const aligned=Math.abs(down.getComponent(axis))>1-1e-8,side=down.getComponent(axis)*scale[axis]>0?1:0;
    const area=aligned?(supportAreas?.[axis*2+side]??0)*Math.abs(scale[(axis+1)%3]*scale[(axis+2)%3]):0;
    const candidate={quaternion:q.toArray(),height:box.max.z-box.min.z,area,angle:original.angleTo(q)};
    const heightTolerance=1e-7,areaTolerance=Math.max(1e-12,(best?.area??0)*.01);
    if(!best||candidate.height<best.height-heightTolerance||Math.abs(candidate.height-best.height)<=heightTolerance&&(candidate.area>best.area+areaTolerance||Math.abs(candidate.area-best.area)<=areaTolerance&&candidate.angle<best.angle-1e-8))best=candidate;
  }
  return best.quaternion;
}
