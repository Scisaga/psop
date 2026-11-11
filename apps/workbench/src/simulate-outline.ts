import {UnsignedByteType,Vector2,type Scene,type Camera} from 'three';
import {OutlinePass} from 'three/examples/jsm/postprocessing/OutlinePass.js';

export function createSimulationOutline(scene:Scene,camera:Camera,kind:'selected'|'compatible'){
  const pass=new OutlinePass(new Vector2(1,1),scene,camera);
  // RGBADepthPacking encodes base-256 digits. Half floats round those digits and falsely occlude millimetre parts.
  pass.renderTargetDepthBuffer.texture.type=UnsignedByteType;
  pass.visibleEdgeColor.set(kind==='compatible'?'#f1bc5e':'#b9e5ff');
  pass.hiddenEdgeColor.set('#000000');
  pass.edgeStrength=kind==='compatible'?3:2.4;
  pass.edgeGlow=kind==='compatible'?.65:.15;
  pass.edgeThickness=kind==='compatible'?1.2:1;
  pass.enabled=false;
  return pass;
}
