import {
  Box3, BufferGeometry, Color, DataTexture, Float32BufferAttribute, Group,
  LinearFilter, Matrix3, Raycaster, RGBAFormat, Sprite, SpriteMaterial, Vector2, Vector3,
  type Camera, type ColorRepresentation, type Mesh, type Object3D,
} from 'three';
import type { AssemblyFeature, Vec3 } from './types';

export interface SourceWitness {
  featureRef: string;
  triangleIndex: number;
  position: Vec3;
  normal: Vec3;
}

export interface SourceSelection {
  /** The one displayed source mesh, with an instance-owned color buffer. */
  geometry: BufferGeometry;
  bounds: Box3;
  fillTriangleCount: number;
  witnesses: SourceWitness[];
  dispose(): void;
}

export interface WitnessMarkers {
  group: Group;
  markers: { sprite: Sprite; witness: SourceWitness }[];
  dispose(): void;
}

export const SOURCE_WITNESS_VISIBILITY_TOLERANCE_M = .00002;

/**
 * Color complete finite features in the source mesh's own draw call. Positions,
 * facet order and prepared display normals are copied without recomputation.
 * A sparse source_region is evidence, not a complete contact surface: it gets
 * one actual source-facet witness and no triangle fill.
 */
export function createSourceSelection(
  source: BufferGeometry,
  features: AssemblyFeature[],
  colors: { baseColor?: ColorRepresentation; highlightColor?: ColorRepresentation } = {},
): SourceSelection {
  const positions = source.getAttribute('position');
  if (source.index || !positions || positions.count % 3) {
    throw new Error('Source selection requires complete non-indexed source facets.');
  }
  const count = positions.count / 3;
  const fill = new Set<number>();
  const bounds = new Box3();
  const witnesses: SourceWitness[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    if (seen.has(feature.id)) continue;
    seen.add(feature.id);
    const origin = new Vector3().fromArray(feature.geometry.origin);
    let witness: SourceWitness | undefined;
    let witnessDistance = Infinity;
    let witnessArea = -1;
    for (const index of feature.geometry.triangle_indices) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= count) {
        throw new Error(`Selected source facet is out of range: ${index}`);
      }
      const a = new Vector3().fromBufferAttribute(positions, index * 3);
      const b = new Vector3().fromBufferAttribute(positions, index * 3 + 1);
      const c = new Vector3().fromBufferAttribute(positions, index * 3 + 2);
      bounds.expandByPoint(a).expandByPoint(b).expandByPoint(c);
      if (feature.geometry.type !== 'source_region') {
        fill.add(index);
        continue;
      }
      // This only chooses a marker within an already selected feature; it never
      // chooses an interface or merges geometry by proximity.
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      const area = normal.lengthSq();
      if (area < 1e-30) continue;
      const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);
      const distance = center.distanceToSquared(origin);
      if (distance < witnessDistance || distance === witnessDistance && area > witnessArea) {
        witness = {
          featureRef: feature.id, triangleIndex: index,
          position: center.toArray() as Vec3, normal: normal.normalize().toArray() as Vec3,
        };
        witnessDistance = distance;
        witnessArea = area;
      }
    }
    if (witness) witnesses.push(witness);
  }

  // Independent buffers keep a shared STL's other instances untouched. The
  // clone can be disposed on deselection without freeing shared source data.
  const geometry = source.clone();
  const base = new Color(colors.baseColor ?? '#6ebbb5');
  const highlight = new Color(colors.highlightColor ?? '#d99922');
  const values = new Float32Array(positions.count * 3);
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    const color = fill.has(Math.floor(vertex / 3)) ? highlight : base;
    values[vertex * 3] = color.r;
    values[vertex * 3 + 1] = color.g;
    values[vertex * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(values, 3));
  geometry.userData.sourceSelection = {
    mode: 'source_facet_colors', filledSourceFacets: fill.size,
    witnessMarkers: witnesses.length, positions: 'unchanged', facetOrder: 'identity',
  };
  return { geometry, bounds, fillTriangleCount: fill.size, witnesses, dispose: () => geometry.dispose() };
}

/** Small screen-sized witness symbols. These contain no filled source facets. */
export function createWitnessMarkers(witnesses: SourceWitness[]): WitnessMarkers {
  const group = new Group();
  group.name = 'source-region-witnesses';
  const markers: WitnessMarkers['markers'] = [];
  if (!witnesses.length) return { group, markers, dispose: () => group.clear() };
  const size = 32;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const distance = Math.hypot(x + .5 - size / 2, y + .5 - size / 2);
    const alpha = Math.max(0, 1 - Math.abs(distance - 11.5) / 1.5, 1 - distance / 2.5);
    const at = (y * size + x) * 4;
    pixels[at] = pixels[at + 1] = pixels[at + 2] = 255;
    pixels[at + 3] = Math.round(alpha * 255);
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  const material = new SpriteMaterial({
    map: texture, color: '#be831c', transparent: true, opacity: .95,
    // The whole glyph remains legible. Visibility is decided at the actual
    // source anchor by updateWitnessVisibility, never by this display quad.
    depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false,
  });
  for (const witness of witnesses) {
    const sprite = new Sprite(material);
    sprite.name = 'source-facet-witness';
    sprite.position.fromArray(witness.position);
    sprite.scale.set(.013, .013, 1);
    sprite.renderOrder = 4;
    sprite.userData = { kind: 'source_witness', ...witness };
    sprite.visible = false;
    group.add(sprite);
    markers.push({ sprite, witness });
  }
  return { group, markers, dispose() { group.clear(); markers.length = 0; material.dispose(); texture.dispose(); } };
}

function hierarchyVisible(object: Object3D) {
  for (let at: Object3D | null = object; at; at = at.parent) if (!at.visible) return false;
  return true;
}

function clipped(object: Object3D, point: Vector3) {
  const material = (object as Mesh).material;
  if (!material) return false;
  const materials = Array.isArray(material) ? material : [material];
  return materials.every(item => {
    const planes = item.clippingPlanes;
    if (!planes?.length) return false;
    return item.clipIntersection
      ? planes.every(plane => plane.distanceToPoint(point) < 0)
      : planes.some(plane => plane.distanceToPoint(point) < 0);
  });
}

/**
 * Call only before a dirty render, after camera projection/pose updates. Each
 * selected region has one anchor ray; ordinary idle frames do no visibility
 * search. Occluders are visible source meshes, not this glyph or its children.
 */
export function updateWitnessVisibility(
  handle: WitnessMarkers, mesh: Mesh, camera: Camera, occluders: Object3D[] = [mesh],
) {
  if (!handle.markers.length) return 0;
  mesh.updateWorldMatrix(true, false);
  camera.updateWorldMatrix(true, false);
  const visibleObjects = occluders.filter(hierarchyVisible);
  for (const object of visibleObjects) object.updateWorldMatrix(true, false);
  const normalMatrix = new Matrix3().getNormalMatrix(mesh.matrixWorld);
  const ray = new Raycaster();
  let visible = 0;
  for (const { sprite, witness } of handle.markers) {
    sprite.visible = false;
    let reason = 'source_hidden';
    const world = new Vector3().fromArray(witness.position).applyMatrix4(mesh.matrixWorld);
    const projected = world.clone().project(camera);
    if (!hierarchyVisible(mesh)) reason = 'source_hidden';
    else if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1) reason = 'outside_view';
    else if (clipped(mesh, world)) reason = 'clipped';
    else {
      ray.setFromCamera(new Vector2(projected.x, projected.y), camera);
      const normal = new Vector3().fromArray(witness.normal).applyMatrix3(normalMatrix).normalize();
      if (normal.dot(ray.ray.direction) >= 0) reason = 'back_facing';
      else {
        const distance = world.clone().sub(ray.ray.origin).dot(ray.ray.direction);
        ray.near = 0;
        ray.far = distance + SOURCE_WITNESS_VISIBILITY_TOLERANCE_M;
        const first = ray.intersectObjects(visibleObjects, false).find(hit => !clipped(hit.object, hit.point));
        sprite.visible = !!first && Math.abs(first.distance - distance) <= SOURCE_WITNESS_VISIBILITY_TOLERANCE_M;
        reason = sprite.visible ? 'visible' : 'occluded';
      }
    }
    sprite.userData.anchorVisibility = reason;
    if (sprite.visible) visible += 1;
  }
  return visible;
}
