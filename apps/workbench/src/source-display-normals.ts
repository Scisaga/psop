import { BufferAttribute, type BufferGeometry } from 'three';

export const DISPLAY_CREASE_DEGREES = 35;
const DISPLAY_ADJACENCY_M = 1e-8;
const displayNormals = new WeakMap<BufferGeometry, { facets: BufferAttribute; smooth: BufferAttribute }>();

/**
 * Shade a source STL without welding, moving or reordering any source vertex.
 * Only faces sharing a source edge within the 10 nm display adjacency tolerance may share a display normal. Angular
 * weighting keeps very thin tessellation triangles from dominating the result;
 * creases and opposite faces remain separate. Facet n is still vertices 3n..3n+2.
 */
export function prepareSourceDisplayNormals(geometry: BufferGeometry, creaseDegrees = DISPLAY_CREASE_DEGREES) {
  if (displayNormals.has(geometry)) return geometry;
  if (geometry.index) throw new Error('Source facet mapping requires a non-indexed STL geometry.');
  const positions = geometry.getAttribute('position');
  if (!positions || positions.count % 3 !== 0) throw new Error('Source geometry must contain complete triangular facets.');
  if (!Number.isFinite(creaseDegrees) || creaseDegrees <= 0 || creaseDegrees >= 90) throw new Error('Display crease angle must be between 0 and 90 degrees.');
  geometry.computeVertexNormals();
  const facets = geometry.getAttribute('normal').clone() as BufferAttribute;
  const vertexIds = new Int32Array(positions.count);
  const vertexKeys = new Map<string, number>();
  const parent = Int32Array.from({ length: positions.count }, (_, i) => i);
  const weight = new Float64Array(positions.count);
  const normal = facets.array;
  const cosCrease = Math.cos(creaseDegrees * Math.PI / 180);
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const join = (a: number, b: number) => { const rootA = find(a), rootB = find(b); if (rootA !== rootB) parent[rootB] = rootA; };
  for (let i = 0; i < positions.count; i += 1) {
    const key = `${Math.round(positions.getX(i) / DISPLAY_ADJACENCY_M)},${Math.round(positions.getY(i) / DISPLAY_ADJACENCY_M)},${Math.round(positions.getZ(i) / DISPLAY_ADJACENCY_M)}`;
    let id = vertexKeys.get(key);
    if (id === undefined) { id = vertexKeys.size; vertexKeys.set(key, id); }
    vertexIds[i] = id;
    const base = i - i % 3;
    const a = base + (i % 3 + 1) % 3, b = base + (i % 3 + 2) % 3;
    const ax = positions.getX(a) - positions.getX(i), ay = positions.getY(a) - positions.getY(i), az = positions.getZ(a) - positions.getZ(i);
    const bx = positions.getX(b) - positions.getX(i), by = positions.getY(b) - positions.getY(i), bz = positions.getZ(b) - positions.getZ(i);
    weight[i] = Math.atan2(Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx), ax * bx + ay * by + az * bz);
  }
  const edges = new Map<string, [number, number][]>();
  for (let base = 0; base < positions.count; base += 3) {
    for (let j = 0; j < 3; j += 1) {
      let a = base + j, b = base + (j + 1) % 3;
      if (vertexIds[a] === vertexIds[b]) continue;
      if (vertexIds[a] > vertexIds[b]) [a, b] = [b, a];
      const key = `${vertexIds[a]}:${vertexIds[b]}`;
      const adjacent = edges.get(key) ?? [];
      adjacent.push([a, b]); edges.set(key, adjacent);
    }
  }
  for (const adjacent of edges.values()) {
    // An ambiguous non-manifold edge is preserved as a source crease rather
    // than inventing adjacency between coincident or intersecting shells.
    if (adjacent.length !== 2) continue;
    const [[a, b], [otherA, otherB]] = adjacent;
    const dot = normal[a * 3] * normal[otherA * 3] + normal[a * 3 + 1] * normal[otherA * 3 + 1] + normal[a * 3 + 2] * normal[otherA * 3 + 2];
    if (dot > cosCrease) { join(a, otherA); join(b, otherB); }
  }
  const sums = new Float64Array(positions.count * 3);
  for (let i = 0; i < positions.count; i += 1) {
    const root = find(i) * 3;
    for (let axis = 0; axis < 3; axis += 1) sums[root + axis] += normal[i * 3 + axis] * weight[i];
  }
  const values = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i += 1) {
    const root = find(i) * 3;
    const length = Math.hypot(sums[root], sums[root + 1], sums[root + 2]);
    for (let axis = 0; axis < 3; axis += 1) values[i * 3 + axis] = length ? sums[root + axis] / length : normal[i * 3 + axis];
  }
  const smooth = new BufferAttribute(values, 3);
  displayNormals.set(geometry, { facets, smooth });
  geometry.setAttribute('normal', smooth);
  geometry.userData.sourceDisplayMapping = { positions: 'unchanged', facetOrder: 'identity', sourceFacetCount: positions.count / 3, creaseDegrees, normalPolicy: 'edge_connected_angle_weighted', adjacencyToleranceM: DISPLAY_ADJACENCY_M };
  return geometry;
}

export function setSourceFacetShading(geometry: BufferGeometry, useFacets: boolean) {
  const normals = displayNormals.get(geometry);
  if (normals) geometry.setAttribute('normal', useFacets ? normals.facets : normals.smooth);
}
