import type { LineBasicMaterial } from 'three';

// Polygon offset affects filled primitives, not WebGL lines. Source boundaries
// otherwise compete with the very triangles that establish their location.
// Bias only their projected depth; source vertices and overlay coordinates stay
// unchanged. A fixed metric bound avoids leaking through walls in distant views.
export const GEOMETRY_BOUNDARY_DEPTH_BIAS_M = 0.000002;

export function geometryBoundaryMaterial<T extends LineBasicMaterial>(material: T): T {
  material.depthTest = true;
  material.depthWrite = false;
  material.userData.geometryBoundaryDepthBiasM = GEOMETRY_BOUNDARY_DEPTH_BIAS_M;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      float boundaryViewZ = min(-0.0000001, mvPosition.z + ${GEOMETRY_BOUNDARY_DEPTH_BIAS_M.toFixed(9)});
      float boundaryClipZ = projectionMatrix[2][2] * boundaryViewZ + projectionMatrix[3][2];
      float boundaryClipW = projectionMatrix[2][3] * boundaryViewZ + projectionMatrix[3][3];
      gl_Position.z = min(gl_Position.z, boundaryClipZ / boundaryClipW * gl_Position.w);
    `);
  };
  material.customProgramCacheKey = () => 'psop.geometry-boundary.metric-depth-bias.1';
  return material;
}
