import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CircularOpening, ConicalFeature, CylindricalFeature, FeaturePattern, GeometrySelection, LogicalHole, MechanicalFeature, Part, PlanarFeature, PrototypeData, SlotFeature } from './types';
import { featuresFor, isAlternativeSupplement, openingGroupsFor, resolveGeometry, supplementalComponentEnabled } from './mechanics-model';
import { disposeSupplementalScene, makeSupplementalScene, supplementalPosition, supplementalWorldBounds, type SupplementalRecord } from './supplement-scene';
import './scene.css';

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}
export interface InspectionState {
  active: boolean;
  selection: GeometrySelection | null;
  translucentPartIds: string[];
  includesOwner: boolean;
  camera: CameraPose;
  previousCamera: CameraPose | null;
  mode: 'local' | 'through_geometry' | 'context_only' | 'inactive';
  visiblePartIds: string[];
  hiddenPartIds: string[];
}

export interface SceneHandle {
  fitAll(): void;
  focusSelected(): void;
  focusGeometry(selection?: GeometrySelection): void;
  setView(view: 'front' | 'right' | 'top' | 'iso'): void;
  getCameraPose(): CameraPose | null;
  setCameraPose(pose: CameraPose): void;
  restoreInspection(): void;
  getInspectionState(): InspectionState;
  getSupplementalDisplay(): { enabled: boolean; referenceEnabled: boolean; activeAlternativeIds: string[]; scopeReviewIds: string[] | null; components: { id: string; visible: boolean; usage: 'reference_connector' | 'unverified_alternative'; status: 'illustrative_unconfirmed'; domain: 'synthetic'; bom_status: 'not_confirmed'; position: [number, number, number]; quaternion: [number, number, number, number]; displayAnchorPartRef: string; displayAnchorOffset: [number, number, number]; displayOnly: true }[] };
}

export interface SceneProps {
  data: PrototypeData;
  selectedId: string | null;
  selection?: GeometrySelection | null;
  hiddenIds: string[];
  isolateId: string | null;
  explosion: number;
  showLabels: boolean;
  showGrid: boolean;
  showGeometryNormals?: boolean;
  clipping: boolean;
  xray: boolean;
  showSupplemental?: boolean;
  supplementReviewIds?: string[] | null;
  activeConnectionAlternativeIds?: string[];
  onSelect(id: string): void;
  onSelectSupplement?(id: string): void;
  onReady?(): void;
  onLoadProgress?(loaded: number, total: number): void;
  onInspectionChange?(state: InspectionState): void;
}

type CameraView = 'front' | 'right' | 'top' | 'iso';
type PartMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
interface MeshRecord {
  part: Part;
  mesh: PartMesh;
  basePosition: THREE.Vector3;
  center: THREE.Vector3;
  offset: THREE.Vector3;
  color: THREE.Color;
}
interface Runtime {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  records: Map<string, MeshRecord>;
  supplements: Map<string, SupplementalRecord>;
  center: THREE.Vector3;
  bounds: THREE.Box3;
  grid: THREE.LineSegments;
  floor: THREE.Mesh;
  contactShadow: THREE.Mesh;
  clippingPlane: THREE.Plane;
  selectedEdge: THREE.LineSegments | null;
  geometryOverlay: THREE.Group | null;
  peerGeometryOverlays: THREE.Group[];
  geometryLocalBounds: THREE.Box3 | null;
  geometryAxis: THREE.Vector3 | null;
  geometryOwnerId: string | null;
  currentView: CameraView;
  viewDirection: THREE.Vector3;
  flight: { position: THREE.Vector3; target: THREE.Vector3 } | null;
  width: number;
  height: number;
  groundTarget: number;
  ready: boolean;
  disposed: boolean;
  inspection: {
    selection: GeometrySelection;
    previousCamera: CameraPose;
    previousView: CameraView;
    previousDirection: THREE.Vector3;
    contextPartIds: Set<string>;
    translucentPartIds: Set<string>;
    samples: { ownerRef: string; point: THREE.Vector3 }[];
    contextOnly: boolean;
    updatedAt: number;
    signature: string;
  } | null;
  onInspectionChange: (state: InspectionState) => void;
  inspectionSuppressedSelection: string | null;
}

const PALETTE = {
  structure: '#bdcdc7',
  shell: '#dce2df',
  actuator: '#35424a',
  electronics: '#377e79',
  bearing: '#a8b3c0',
  other: '#c7d0d9',
};
const ISO_DIRECTION = new THREE.Vector3(1.15, -1.7, 0.82).normalize();
const VIEWS: Record<CameraView, THREE.Vector3> = {
  iso: ISO_DIRECTION,
  front: new THREE.Vector3(1, 0, 0.025).normalize(),
  right: new THREE.Vector3(0, -1, 0.025).normalize(),
  top: new THREE.Vector3(0.002, -0.002, 1).normalize(),
};
const TEMP_POSITION = new THREE.Vector3();

function boxCorners(bounds: THREE.Box3) {
  return [bounds.min.x, bounds.max.x].flatMap(x => [bounds.min.y, bounds.max.y].flatMap(y => [bounds.min.z, bounds.max.z].map(z => new THREE.Vector3(x, y, z))));
}

function fitDistance(runtime: Runtime, bounds: THREE.Box3, target: THREE.Vector3, direction: THREE.Vector3, padding: number, minimumExtent: number) {
  const tangentY = Math.tan(THREE.MathUtils.degToRad(runtime.camera.fov / 2));
  // Horizontal FOV depends on the actual canvas aspect. Account for each
  // corner's depth as well as its screen-space width and height.
  const tangentX = tangentY * Math.max(runtime.camera.aspect, 1e-4);
  const right = new THREE.Vector3().crossVectors(runtime.camera.up, direction).normalize();
  if (right.lengthSq() < 1e-8) right.crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  let distance = Math.max(runtime.controls.minDistance, minimumExtent / (2 * Math.min(tangentX, tangentY)) * padding);
  for (const corner of boxCorners(bounds)) {
    const offset = corner.sub(target), depth = offset.dot(direction);
    distance = Math.max(distance, depth + Math.abs(offset.dot(right)) * padding / tangentX, depth + Math.abs(offset.dot(up)) * padding / tangentY, depth + runtime.camera.near * 2);
  }
  return distance;
}

function visibleBounds(runtime: Runtime, explosion: number, onlySelected?: string | null) {
  const bounds = new THREE.Box3();
  const transform = new THREE.Matrix4();
  for (const [id, record] of runtime.records) {
    if (!record.mesh.visible || (onlySelected && id !== onlySelected)) continue;
    const position = record.basePosition.clone().addScaledVector(record.offset, explosion);
    transform.compose(position, record.mesh.quaternion, record.mesh.scale);
    const box = record.mesh.geometry.boundingBox;
    if (box) bounds.union(box.clone().applyMatrix4(transform));
  }
  return bounds;
}

function frameBounds(runtime: Runtime, bounds: THREE.Box3, view = runtime.currentView, focus = false, preserveAngle = false) {
  if (bounds.isEmpty()) return;
  const target = bounds.getCenter(new THREE.Vector3());
  const direction = preserveAngle
    ? (runtime.flight ? runtime.flight.position.clone().sub(runtime.flight.target) : runtime.camera.position.clone().sub(runtime.controls.target)).normalize()
    : VIEWS[view].clone();
  // Reusing the exact direction avoids floating-point drift over repeated
  // explode / restore cycles, while retaining an intentionally orbited angle.
  if (preserveAngle && direction.distanceToSquared(runtime.viewDirection) < 0.0000000001) direction.copy(runtime.viewDirection);
  else runtime.viewDirection.copy(direction);
  const distance = fitDistance(runtime, bounds, target, direction, focus ? 1.45 : 1.37, focus ? .045 : .18);
  runtime.currentView = view;
  runtime.flight = { target, position: target.clone().addScaledVector(direction, distance) };
}

function makeGrid() {
  const points: number[] = [];
  const size = 1.8;
  const step = 0.025;
  for (let i = -size / 2; i < size / 2 + step / 2; i += step) {
    points.push(-size / 2, i, 0, size / 2, i, 0, i, -size / 2, 0, i, size / 2, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#aeb9cc', transparent: true, opacity: 0.19, depthWrite: false }));
}

function makeContactShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(128, 128, 4, 128, 128, 124);
    gradient.addColorStop(0, 'rgba(60,70,92,.20)');
    gradient.addColorStop(0.4, 'rgba(60,70,92,.09)');
    gradient.addColorStop(1, 'rgba(60,70,92,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  return new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.35), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.8 }));
}

function explosionOffset(record: MeshRecord, center: THREE.Vector3) {
  const radial = record.center.clone().sub(center);
  const offset = new THREE.Vector3();
  const lateral = Math.abs(radial.y) < 0.004 ? (record.part.id.charCodeAt(record.part.id.length - 1) % 2 ? -1 : 1) : Math.sign(radial.y);
  switch (record.part.group) {
    case 'head':
      offset.set(radial.x * 0.58 + 0.009, radial.y * 1.15, 0.066 + Math.max(0, radial.z) * 0.42);
      break;
    case 'left-leg':
      offset.set(radial.x * 0.65, 0.058 + Math.max(0, radial.y) * 0.4, -0.024 + Math.min(0, radial.z) * 0.28);
      break;
    case 'right-leg':
      offset.set(radial.x * 0.65, -0.058 + Math.min(0, radial.y) * 0.4, -0.024 + Math.min(0, radial.z) * 0.28);
      break;
    default:
      offset.set(radial.x * 0.8, lateral * (0.022 + Math.abs(radial.y) * 0.75), radial.z * 0.5);
      break;
  }
  // The vectors are presentation offsets. They never replace source placements.
  if (/shell/.test(record.part.meshKey)) offset.y += lateral * 0.035;
  if (record.part.kind === 'bearing') offset.y += lateral * 0.012;
  return offset;
}

function presentation(runtime: Runtime, props: SceneProps) {
  applySourcePresentation(runtime, props);
  let visibleSupplements = 0;
  for (const record of runtime.supplements.values()) {
    if (record.group.visible) visibleSupplements += 1;
    const selected = props.selection?.kind === 'supplement' && props.selection.id === record.component.id;
    record.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material as THREE.MeshStandardMaterial;
      material.color.set(selected ? '#e4b94d' : '#ba9955');
      material.emissive.set(selected ? '#9c6a17' : '#000000'); material.emissiveIntensity = selected ? .15 : 0;
      material.opacity = props.xray && !selected ? .35 : .88;
      material.clippingPlanes = props.clipping ? [runtime.clippingPlane] : [];
      material.needsUpdate = true;
    });
  }
  const host = runtime.renderer.domElement.parentElement;
  if (host) { host.dataset.supplementalInstances = String(runtime.supplements.size); host.dataset.visibleSupplementalInstances = String(visibleSupplements); host.dataset.supplementalAuthority = 'illustrative_unconfirmed'; }
  runtime.grid.visible = props.showGrid;
  runtime.renderer.shadowMap.needsUpdate = true;
  if (runtime.selectedEdge) {
    runtime.selectedEdge.parent?.remove(runtime.selectedEdge);
    runtime.selectedEdge.geometry.dispose();
    (runtime.selectedEdge.material as THREE.Material).dispose();
    runtime.selectedEdge = null;
  }
  const selected = props.selectedId ? runtime.records.get(props.selectedId) : null;
  if (selected?.mesh.visible) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(selected.mesh.geometry, 32), new THREE.LineBasicMaterial({ color: '#147d83', transparent: true, opacity: runtime.inspection?.translucentPartIds.has(selected.part.id) ? .12 : .5 }));
    edges.renderOrder = 3;
    selected.mesh.add(edges);
    runtime.selectedEdge = edges;
  }
  setGeometryNormalsVisible(runtime, props.showGeometryNormals ?? false);
}

function applySourcePresentation(runtime: Runtime, props: SceneProps) {
  const hidden = new Set(props.hiddenIds);
  for (const [id, record] of runtime.records) {
    const selected = props.selectedId === id;
    const localContext = runtime.inspection?.contextPartIds.has(id) === true;
    const faded = runtime.inspection?.translucentPartIds.has(id) === true;
    record.mesh.visible = localContext || !hidden.has(id) && (!props.isolateId || props.isolateId === id);
    const material = record.mesh.material;
    material.color.copy(selected ? new THREE.Color('#6ebbb5') : record.color);
    material.emissive.set(selected ? '#126b70' : '#000000');
    material.emissiveIntensity = selected ? 0.13 : 0;
    const transparent = faded || props.xray && !selected;
    const depthWrite = !transparent;
    const changed = material.transparent !== transparent || material.depthWrite !== depthWrite || (material.clippingPlanes?.length || 0) !== (props.clipping ? 1 : 0);
    material.transparent = transparent;
    material.opacity = faded ? localContext ? .18 : .08 : props.xray && !selected ? .22 : 1;
    material.depthWrite = depthWrite;
    // Source assemblies can contain coincident, outward-facing contact faces
    // with different triangulations. Give opaque actuator surfaces a stable
    // depth priority without changing source vertices, triangle IDs or poses.
    material.polygonOffset = record.part.kind === 'actuator' && material.depthWrite;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -2;
    material.clippingPlanes = props.clipping ? [runtime.clippingPlane] : [];
    if (changed) material.needsUpdate = true;
  }
  if (runtime.selectedEdge && props.selectedId) {
    (runtime.selectedEdge.material as THREE.LineBasicMaterial).opacity = runtime.inspection?.translucentPartIds.has(props.selectedId) ? .12 : .5;
  }
  applySupplementalVisibility(runtime, props);
}
function applySupplementalVisibility(runtime: Runtime, props: SceneProps) {
  const hidden = new Set(props.hiddenIds);
  const selection = runtime.inspection?.selection;
  const activeReviewId = selection?.kind === 'connection_review' ? selection.id : selection?.kind === 'supplement' ? runtime.supplements.get(selection.id)?.component.review_ref : undefined;
  let visible = 0;
  for (const record of runtime.supplements.values()) {
    const review = props.data.analysis?.connection_reviews?.find(item => item.id === record.component.review_ref);
    const allowed = supplementalComponentEnabled(props.data, record.component, props.showSupplemental === true, props.supplementReviewIds, props.activeConnectionAlternativeIds);
    const localContext = activeReviewId === record.component.review_ref;
    const userVisible = !hidden.has(record.anchorPartRef) && (!props.isolateId || !!review?.participants.some(item => item.part_ref === props.isolateId));
    record.group.visible = allowed && (localContext || userVisible);
    if (record.group.visible) visible += 1;
  }
  const host = runtime.renderer.domElement.parentElement;
  if (host) { host.dataset.visibleSupplementalInstances = String(visible); host.dataset.visibleAlternativeInstances = String([...runtime.supplements.values()].filter(item => item.group.visible && isAlternativeSupplement(props.data, item.component)).length); }
}

function actualCamera(runtime: Runtime): CameraPose {
  return { position: runtime.camera.position.toArray() as CameraPose['position'], target: runtime.controls.target.toArray() as CameraPose['target'] };
}
function inspectionState(runtime: Runtime | null): InspectionState {
  const inspection = runtime?.inspection;
  return { active: !!inspection, selection: inspection?.selection || null, translucentPartIds: [...inspection?.translucentPartIds ?? []], includesOwner: !!runtime?.geometryOwnerId && !!inspection?.translucentPartIds.has(runtime.geometryOwnerId), camera: runtime ? actualCamera(runtime) : { position: [0, 0, 0], target: [0, 0, 0] }, previousCamera: inspection?.previousCamera || null, mode: !inspection ? 'inactive' : inspection.contextOnly ? 'context_only' : inspection.translucentPartIds.size ? 'through_geometry' : 'local', visiblePartIds: [...runtime?.records.values() ?? []].filter(item => item.mesh.visible).map(item => item.part.id), hiddenPartIds: [...runtime?.records.values() ?? []].filter(item => !item.mesh.visible).map(item => item.part.id) };
}
function publishInspection(runtime: Runtime) {
  const state = inspectionState(runtime);
  const signature = [state.selection?.kind, state.selection?.id, state.selection?.ownerRef, state.mode, ...state.translucentPartIds].join('|');
  const host = runtime.renderer.domElement.parentElement;
  if (host) { host.dataset.inspectionActive = String(state.active); host.dataset.inspectionMode = state.mode; host.dataset.inspectionTranslucentParts = state.translucentPartIds.join(','); host.dataset.inspectionOwnerTranslucent = String(state.includesOwner); }
  if (!runtime.inspection || runtime.inspection.signature !== signature) { if (runtime.inspection) runtime.inspection.signature = signature; runtime.onInspectionChange(state); }
}
function inspectionOverlayDepth(runtime: Runtime, through: boolean) {
  for (const overlay of [runtime.geometryOverlay, ...runtime.peerGeometryOverlays]) overlay?.traverse(object => {
    const drawable = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
    for (const material of Array.isArray(drawable.material) ? drawable.material : drawable.material ? [drawable.material] : []) {
      if (typeof material.userData.inspectionDepthTest !== 'boolean') material.userData.inspectionDepthTest = material.depthTest;
      material.depthTest = through ? false : material.userData.inspectionDepthTest;
    }
  });
}
function restoreInspection(runtime: Runtime, props: SceneProps) {
  const previous = runtime.inspection;
  if (!previous) return;
  runtime.inspection = null;
  runtime.inspectionSuppressedSelection = [previous.selection.kind, previous.selection.id, previous.selection.ownerRef || ''].join('|');
  applySourcePresentation(runtime, props); inspectionOverlayDepth(runtime, false);
  runtime.currentView = previous.previousView; runtime.viewDirection.copy(previous.previousDirection);
  runtime.flight = { position: new THREE.Vector3().fromArray(previous.previousCamera.position), target: new THREE.Vector3().fromArray(previous.previousCamera.target) };
  runtime.renderer.shadowMap.needsUpdate = true;
  publishInspection(runtime);
}

type InspectionSample = { ownerRef: string; point: THREE.Vector3 };
function inspectionSamples(runtime: Runtime, props: SceneProps, selection: GeometrySelection, fallback: THREE.Box3): InspectionSample[] {
  const descriptor = resolveGeometry(props.data, selection);
  if (!descriptor) return [];
  const samples: InspectionSample[] = [];
  const addTriangles = (ownerRef: string, indices: number[]) => {
    const positions = runtime.records.get(ownerRef)?.mesh.geometry.getAttribute('position');
    if (!positions || !indices.length) return;
    for (let index = 0; index < indices.length; index += Math.max(1, Math.ceil(indices.length / 8))) {
      const first = indices[index] * 3;
      if (first + 2 >= positions.count) continue;
      const point = new THREE.Vector3();
      for (let vertex = first; vertex < first + 3; vertex += 1) point.add(new THREE.Vector3().fromBufferAttribute(positions, vertex));
      samples.push({ ownerRef, point: point.multiplyScalar(1 / 3) });
    }
  };
  for (const participant of [{ ownerRef: descriptor.ownerRef, featureRefs: descriptor.featureRefs, openingRefs: descriptor.openingRefs, siteRefs: descriptor.siteRefs }, ...descriptor.peers]) {
    featuresFor(props.data, participant.featureRefs).forEach(feature => addTriangles(participant.ownerRef, feature.geometry.triangle_indices));
    for (const opening of props.data.analysis?.circular_openings?.filter(item => participant.openingRefs?.includes(item.id)) ?? []) {
      const vertices = opening.geometry.boundary_vertices;
      for (let index = 0; index < vertices.length; index += Math.max(1, Math.ceil(vertices.length / 8))) samples.push({ ownerRef: participant.ownerRef, point: new THREE.Vector3().fromArray(vertices[index]) });
      samples.push({ ownerRef: participant.ownerRef, point: new THREE.Vector3().fromArray(opening.geometry.center) });
    }
    for (const site of props.data.analysis?.mounting_sites?.filter(item => participant.siteRefs?.includes(item.id)) ?? []) samples.push({ ownerRef: participant.ownerRef, point: new THREE.Vector3().fromArray(site.position) });
  }
  if (descriptor.passageRef) {
    const passage = props.data.analysis?.passage_hypotheses?.find(item => item.id === descriptor.passageRef);
    if (passage) addTriangles(passage.owner_ref, passage.wall_triangle_indices);
  }
  if (descriptor.supplementRef) {
    const selected = runtime.supplements.get(descriptor.supplementRef);
    for (const item of runtime.supplements.values()) if (item.component.review_ref === selected?.component.review_ref && item.group.visible) {
      samples.push({ ownerRef: item.component.id, point: item.localBounds.getCenter(new THREE.Vector3()) });
      boxCorners(item.localBounds).forEach(point => samples.push({ ownerRef: item.component.id, point }));
    }
  }
  if (!samples.length) samples.push({ ownerRef: descriptor.ownerRef, point: fallback.getCenter(new THREE.Vector3()) });
  return samples.filter((_, index) => index % Math.max(1, Math.ceil(samples.length / 48)) === 0);
}
function sampleWorldPoint(runtime: Runtime, sample: InspectionSample, explosion?: number) {
  const owner = runtime.records.get(sample.ownerRef);
  if (owner) return explosion == null
    ? sample.point.clone().applyMatrix4(owner.mesh.matrixWorld)
    : sample.point.clone().multiply(owner.mesh.scale).applyQuaternion(owner.mesh.quaternion).add(owner.basePosition).addScaledVector(owner.offset, explosion);
  const supplemental = runtime.supplements.get(sample.ownerRef);
  if (!supplemental) return sample.point.clone();
  return explosion == null ? sample.point.clone().applyMatrix4(supplemental.group.matrixWorld)
    : sample.point.clone().multiply(supplemental.group.scale).applyQuaternion(supplemental.group.quaternion).add(supplementalPosition(supplemental, explosion, runtime.records.get(supplemental.anchorPartRef)?.offset));
}
function visibilityObstructions(runtime: Runtime, props: SceneProps, cameraPosition: THREE.Vector3, targets: THREE.Vector3[], desiredPose = false) {
  const raycaster = new THREE.Raycaster();
  const visibleRecords = [...runtime.records.values()].filter(record => record.mesh.visible && (!props.xray || props.selectedId === record.part.id));
  const meshes = visibleRecords.map(record => {
    if (!desiredPose) return { id: record.part.id, mesh: record.mesh };
    const mesh = new THREE.Mesh(record.mesh.geometry, record.mesh.material);
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorld.compose(record.basePosition.clone().addScaledVector(record.offset, props.explosion), record.mesh.quaternion, record.mesh.scale);
    return { id: record.part.id, mesh };
  });
  const blockers = new Set<string>(); let blockedSamples = 0;
  for (const target of targets) {
    const direction = target.clone().sub(cameraPosition), distance = direction.length();
    if (distance < .00002) continue;
    raycaster.set(cameraPosition, direction.normalize()); raycaster.near = .000005; raycaster.far = Math.max(.000005, distance - .00002);
    let blocked = false;
    for (const item of meshes) {
      if (raycaster.intersectObject(item.mesh, false).some(hit => !props.clipping || runtime.clippingPlane.distanceToPoint(hit.point) >= 0)) { blockers.add(item.id); blocked = true; }
    }
    if (blocked) blockedSamples += 1;
  }
  return { blockers, blockedSamples };
}
function updateInspectionVisibility(runtime: Runtime, props: SceneProps, force = false) {
  const inspection = runtime.inspection;
  if (!inspection || !runtime.ready || runtime.flight && !force) return;
  const now = performance.now();
  if (!force && now - inspection.updatedAt < 120) return;
  inspection.updatedAt = now;
  runtime.scene.updateMatrixWorld(true); runtime.camera.updateMatrixWorld(true);
  const targets = inspection.samples.map(sample => sampleWorldPoint(runtime, sample));
  const result = inspection.contextOnly ? { blockers: new Set<string>(), blockedSamples: 0 } : visibilityObstructions(runtime, props, runtime.camera.position, targets);
  inspection.translucentPartIds = result.blockers;
  applySourcePresentation(runtime, props);
  inspectionOverlayDepth(runtime, result.blockers.size > 0 || props.xray);
  runtime.renderer.shadowMap.needsUpdate = true;
  const host = runtime.renderer.domElement.parentElement;
  if (host) { host.dataset.inspectionTargetSamples = String(targets.length); host.dataset.inspectionObstructedSamples = String(result.blockedSamples); }
  publishInspection(runtime);
}

function setGeometryNormalsVisible(runtime: Runtime, enabled: boolean) {
  let visible = 0;
  for (const overlay of [runtime.geometryOverlay, ...runtime.peerGeometryOverlays]) {
    overlay?.traverse(object => {
      if (object.userData.geometryNormal !== true) return;
      object.visible = enabled;
      let node: THREE.Object3D | null = object;
      while (node?.visible) node = node.parent;
      if (!node) visible += 1;
    });
  }
  const host = runtime.renderer.domElement.parentElement;
  if (host) { host.dataset.geometryNormals = visible > 0 ? 'visible' : 'hidden'; host.dataset.visibleGeometryNormals = String(visible); host.dataset.interfaceNormals = runtime.geometryOverlay?.userData.authority === 'mechanism_candidate' && visible > 0 ? 'visible' : 'hidden'; host.dataset.visibleInterfaceNormals = runtime.geometryOverlay?.userData.authority === 'mechanism_candidate' ? String(visible) : '0'; }
}

function clearGeometryOverlay(runtime: Runtime) {
  const overlays = [runtime.geometryOverlay, ...runtime.peerGeometryOverlays].filter((item): item is THREE.Group => !!item);
  for (const overlay of overlays) {
    overlay.parent?.remove(overlay);
    const materials = new Set<THREE.Material>();
    overlay.traverse(object => {
      const drawable = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
      drawable.geometry?.dispose();
      if (Array.isArray(drawable.material)) drawable.material.forEach(material => materials.add(material));
      else if (drawable.material) materials.add(drawable.material);
    });
    materials.forEach(material => material.dispose());
  }
  runtime.geometryOverlay = null;
  runtime.peerGeometryOverlays = [];
  runtime.geometryLocalBounds = null;
  runtime.geometryAxis = null;
  runtime.geometryOwnerId = null;
  const host = runtime.renderer.domElement.parentElement;
  if (host) { host.dataset.geometryNormals = host.dataset.interfaceNormals = 'hidden'; host.dataset.visibleGeometryNormals = host.dataset.visibleInterfaceNormals = '0'; delete host.dataset.geometryProjectedBounds; delete host.dataset.geometryCameraFacing; delete host.dataset.geometryFrustumInside; }
}

function cylindricalOverlay(feature: CylindricalFeature, source: THREE.BufferGeometry, bounds: THREE.Box3, color: string, entryPositions?: number[][]) {
  const group = new THREE.Group();
  const axis = new THREE.Vector3().fromArray(feature.geometry.axis).normalize();
  const origin = new THREE.Vector3().fromArray(feature.geometry.origin);
  const radius = feature.geometry.radius_m;
  const [start, end] = feature.geometry.axial_range_m;
  const radial = new THREE.Vector3(Math.abs(axis.z) < 0.9 ? 0 : 1, 0, Math.abs(axis.z) < 0.9 ? 1 : 0).cross(axis).normalize();
  const tangent = axis.clone().cross(radial).normalize();
  const lineMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.98, depthTest: true, depthWrite: false });
  const centers = entryPositions?.length ? entryPositions.map(point => new THREE.Vector3().fromArray(point)) : [start, end].map(distance => origin.clone().addScaledVector(axis, distance));
  for (const center of centers) {
    const points = Array.from({ length: 96 }, (_, index) => center.clone().addScaledVector(radial, Math.cos(index * Math.PI / 48) * radius).addScaledVector(tangent, Math.sin(index * Math.PI / 48) * radius));
    points.forEach(point => bounds.expandByPoint(point));
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), lineMaterial);
    ring.userData.entryRing = true;
    ring.renderOrder = 10;
    group.add(ring);
  }
  const axisPoints = entryPositions?.length ? centers.flatMap(center => {
    const direction = center.clone().sub(origin).dot(axis) >= 0 ? -1 : 1;
    return [center.clone().addScaledVector(axis, -direction * .001), center.clone().addScaledVector(axis, direction * Math.min(.003, end - start))];
  }) : [start - 0.0015, end + 0.0015].map(distance => origin.clone().addScaledVector(axis, distance));
  const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(axisPoints), new THREE.LineDashedMaterial({ color, dashSize: 0.0006, gapSize: 0.0004, transparent: true, opacity: 0.75, depthTest: true, depthWrite: false }));
  line.computeLineDistances(); line.renderOrder = 10; group.add(line);
  const patch = sourceTrianglePatch(feature.geometry.triangle_indices, source, bounds, color);
  if (patch) group.add(patch);
  return group;
}

function sourceTrianglePatch(triangleIndices: number[], source: THREE.BufferGeometry, bounds: THREE.Box3, color: string) {
  const positions = source.getAttribute('position');
  const indices = source.getIndex();
  const vertices: number[] = [];
  for (const triangle of triangleIndices) {
    const first = triangle * 3;
    if (first + 2 >= (indices?.count ?? positions.count)) continue;
    for (let corner = 0; corner < 3; corner += 1) {
      const index = indices ? indices.getX(first + corner) : first + corner;
      const point = new THREE.Vector3(positions.getX(index), positions.getY(index), positions.getZ(index));
      vertices.push(...point.toArray()); bounds.expandByPoint(point);
    }
  }
  if (!vertices.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const patch = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  patch.renderOrder = 9;
  return patch;
}

function planarOverlay(feature: PlanarFeature, source: THREE.BufferGeometry, bounds: THREE.Box3, color: string) {
  const group = new THREE.Group();
  const patch = sourceTrianglePatch(feature.geometry.triangle_indices, source, bounds, color);
  if (patch) group.add(patch);
  const lineMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false });
  for (const loop of feature.geometry.boundary_loops) {
    const points = loop.map(point => new THREE.Vector3().fromArray(point));
    points.forEach(point => bounds.expandByPoint(point));
    const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMaterial);
    outline.renderOrder = 10; group.add(outline);
  }
  const origin = new THREE.Vector3().fromArray(feature.geometry.origin);
  const normal = new THREE.Vector3().fromArray(feature.geometry.normal).normalize();
  const length = THREE.MathUtils.clamp(Math.sqrt(feature.geometry.area_m2) * 0.4, 0.003, 0.012);
  const end = origin.clone().addScaledVector(normal, length);
  const across = new THREE.Vector3(Math.abs(normal.z) < 0.9 ? 0 : 1, 0, Math.abs(normal.z) < 0.9 ? 1 : 0).cross(normal).normalize();
  const back = end.clone().addScaledVector(normal, -length * 0.22);
  const segments = [origin, end, end, back.clone().addScaledVector(across, length * 0.12), end, back.clone().addScaledVector(across, -length * 0.12)];
  const arrow = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segments), lineMaterial);
  arrow.userData.geometryNormal = true;
  arrow.visible = false;
  arrow.renderOrder = 10; group.add(arrow);
  return group;
}

function featureOverlay(feature: MechanicalFeature, source: THREE.BufferGeometry, bounds: THREE.Box3, color = '#d69529', entryPositions?: number[][]) {
  const group = feature.kind === 'planar_patch' ? planarOverlay(feature, source, bounds, color) : feature.geometry.type === 'conical_frustum' ? conicalOverlay(feature as ConicalFeature, source, bounds, color) : cylindricalOverlay(feature as CylindricalFeature, source, bounds, color, entryPositions);
  const patch = group.children.find((object): object is THREE.Mesh<THREE.BufferGeometry> => object instanceof THREE.Mesh);
  group.userData.featureType = feature.geometry.type;
  group.userData.sourceTriangleCount = patch ? patch.geometry.getAttribute('position').count / 3 : 0;
  return group;
}

function conicalOverlay(feature: ConicalFeature, source: THREE.BufferGeometry, bounds: THREE.Box3, color: string) {
  const group = new THREE.Group();
  // The source may truncate the cone at the housing. Highlight only its actual
  // source triangles; an analytic cone or a bore ring would invent geometry.
  const patch = sourceTrianglePatch(feature.geometry.triangle_indices, source, bounds, color);
  if (patch) group.add(patch);
  return group;
}

function holePortalOverlay(hole: LogicalHole, source: THREE.BufferGeometry, bounds: THREE.Box3, portalRefs?: Set<string>) {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: '#e9b34f', depthTest: true, depthWrite: false, transparent: true, opacity: 0.9 });
  const portals = hole.portals.filter(portal => !portalRefs || portalRefs.has(portal.id));
  for (const portal of portals) {
    const points = portal.boundary_vertices.map(point => new THREE.Vector3().fromArray(point));
    points.forEach(point => bounds.expandByPoint(point));
    if (points.length > 1) { const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material); outline.renderOrder = 11; group.add(outline); }
  }
  // Rim-support triangles establish source topology. They are not the selected
  // aperture or an installation contact area, and may span an entire casing.
  // Keep them in the published evidence instead of painting them as a patch.
  void source;
  group.userData.sourceTriangleCount = 0;
  group.userData.featureType = 'portal';
  return group;
}

function patternGuideOverlay(pattern: FeaturePattern, bounds: THREE.Box3) {
  const group = new THREE.Group(), points = pattern.geometry.member_centers.map(point => new THREE.Vector3().fromArray(point));
  const center = new THREE.Vector3().fromArray(pattern.geometry.origin), normal = new THREE.Vector3().fromArray(pattern.geometry.normal).normalize();
  const radial = points[0]?.clone().sub(center).normalize();
  if (!radial || !points.length) return group;
  const tangent = normal.clone().cross(radial).normalize();
  const material = new THREE.LineDashedMaterial({ color: '#b49755', dashSize: .00055, gapSize: .00045, opacity: .6, transparent: true, depthTest: true, depthWrite: false });
  let curve: THREE.Vector3[];
  if (pattern.geometry.type === 'circular' && pattern.geometry.pitch_circle_diameter_m) {
    const radius = pattern.geometry.pitch_circle_diameter_m / 2;
    curve = Array.from({ length: 97 }, (_, i) => center.clone().addScaledVector(radial, Math.cos(i * Math.PI / 48) * radius).addScaledVector(tangent, Math.sin(i * Math.PI / 48) * radius));
  } else {
    curve = [...points].sort((a, b) => Math.atan2(a.clone().sub(center).dot(tangent), a.clone().sub(center).dot(radial)) - Math.atan2(b.clone().sub(center).dot(tangent), b.clone().sub(center).dot(radial)));
    if (curve.length > 2) curve.push(curve[0]);
  }
  curve.forEach(point => bounds.expandByPoint(point));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve), material); line.computeLineDistances(); line.renderOrder = 10; group.add(line);
  group.userData.featureType = 'pattern_guide'; group.userData.sourceTriangleCount = 0;
  return group;
}

function slotOverlay(slot: SlotFeature, bounds: THREE.Box3) {
  const group = new THREE.Group(), points = slot.geometry.boundary_vertices.map(point => new THREE.Vector3().fromArray(point));
  points.forEach(point => bounds.expandByPoint(point));
  const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#d6a348', transparent: true, opacity: .95, depthTest: true, depthWrite: false }));
  outline.renderOrder = 11; group.add(outline);
  const center = new THREE.Vector3().fromArray(slot.geometry.origin), axis = new THREE.Vector3().fromArray(slot.geometry.major_axis);
  const guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints([-1, 1].map(sign => center.clone().addScaledVector(axis, sign * slot.geometry.length_m / 2))), new THREE.LineDashedMaterial({ color: '#c1a56a', transparent: true, opacity: .6, dashSize: .0006, gapSize: .0005, depthTest: true, depthWrite: false }));
  guide.computeLineDistances(); group.add(guide); group.userData.featureType = 'slot'; group.userData.sourceTriangleCount = 0;
  return group;
}

function openingOverlay(opening: CircularOpening, bounds: THREE.Box3, color: string) {
  const group = new THREE.Group();
  const points = opening.geometry.boundary_vertices.map(point => new THREE.Vector3().fromArray(point));
  points.forEach(point => bounds.expandByPoint(point));
  const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: .98, depthTest: true, depthWrite: false }));
  outline.userData.openingBoundary = true; group.add(outline);
  group.userData.featureType = 'circular_opening'; group.userData.sourceTriangleCount = 0;
  return group;
}

function presentGeometry(runtime: Runtime, props: SceneProps, selection = props.selection) {
  clearGeometryOverlay(runtime);
  const host = runtime.renderer.domElement.parentElement;
  if (host) {
    for (const key of ['interfaceHighlight', 'highlightedInterface', 'observationHighlight', 'featureHighlight', 'holeHighlight', 'patternHighlight', 'siteHighlight', 'pinFitHighlight', 'mountHighlight', 'mountingInterfaceHighlight', 'slotHighlight', 'openingHighlight', 'passageHighlight', 'reviewHighlight', 'supplementHighlight', 'legacyGroupHighlight', 'legacyObservationHighlight', 'geometryAuthority', 'geometrySelectionKind', 'geometryFeatureTypes', 'geometryPeerOwners', 'selectedEntrySide', 'selectedEntryDirection']) host.dataset[key] = '';
    for (const key of ['highlightedFeatures', 'highlightedPlanes', 'planeFeatures', 'highlightedCylinders', 'highlightedCones', 'highlightedTriangles', 'highlightedSupportTriangles', 'highlightedSiteEntrances', 'highlightedEntryRings']) host.dataset[key] = '0';
    delete host.dataset.geometryWorldCenter; delete host.dataset.interfaceWorldCenter; delete host.dataset.observationWorldCenter;
  }
  const selected = resolveGeometry(props.data, selection ?? null);
  const owner = selected ? runtime.records.get(selected.ownerRef) : null;
  if (!selected || !owner) return;
  const features = featuresFor(props.data, selected.featureRefs).filter(feature => feature.owner_ref === selected.ownerRef);
  const slot = selected.slotRef ? props.data.analysis?.slot_features?.find(item => item.id === selected.slotRef) : undefined;
  const openings = props.data.analysis?.circular_openings?.filter(item => selected.openingRefs?.includes(item.id)) ?? [];
  const passage = selected.passageRef ? props.data.analysis?.passage_hypotheses?.find(item => item.id === selected.passageRef) : undefined;
  const supplement = selected.supplementRef ? runtime.supplements.get(selected.supplementRef) : undefined;
  if (supplement && !supplementalComponentEnabled(props.data, supplement.component, props.showSupplemental === true, props.supplementReviewIds, props.activeConnectionAlternativeIds)) return;
  const contextOnly = !features.length && !slot && !openings.length && !passage && !supplement && selected.selection.kind === 'connection_review';
  if (!features.length && !slot && !openings.length && !passage && !supplement && !contextOnly) return;
  const group = new THREE.Group();
  group.name = `${selected.selection.kind}-highlight:${selected.selection.id}`;
  group.userData.selection = selected.selection;
  group.userData.authority = selected.authority;
  group.userData.surface = features.some(feature => feature.geometry.type === 'plane');
  group.userData.contextPartRefs = selected.contextPartRefs;
  const bounds = new THREE.Box3();
  const selectedPattern = selected.selection.kind === 'pattern' ? props.data.analysis?.feature_patterns?.find(item => item.id === selected.selection.id) : undefined;
  const patternEntries = selectedPattern ? props.data.analysis?.logical_holes?.filter(hole => selectedPattern.logical_hole_refs.includes(hole.id)).flatMap(hole => hole.portals.filter(portal => selectedPattern.portal_refs.includes(portal.id)).map(portal => ({ refs: hole.wall_feature_refs, point: portal.position }))) : undefined;
  const selectedSites = selected.siteRefs ? props.data.analysis?.mounting_sites?.filter(site => selected.siteRefs!.includes(site.id)) : undefined;
  for (const feature of features) group.add(featureOverlay(feature, owner.mesh.geometry, bounds, '#d69529', selectedSites ? selectedSites.filter(site => site.feature_refs.includes(feature.id)).map(site => site.position) : patternEntries?.filter(entry => entry.refs.includes(feature.id)).map(entry => entry.point)));
  if (slot) group.add(slotOverlay(slot, bounds));
  openings.forEach(opening => group.add(openingOverlay(opening, bounds, '#d69529')));
  if (passage) {
    const patch = sourceTrianglePatch(passage.wall_triangle_indices, owner.mesh.geometry, bounds, '#d69529');
    const cavity = new THREE.Group(); if (patch) cavity.add(patch);
    cavity.userData.featureType = 'finite_cavity'; cavity.userData.sourceTriangleCount = passage.wall_triangle_indices.length; group.add(cavity);
  }
  if (supplement || contextOnly) {
    const ownerPlacement = new THREE.Matrix4().compose(owner.basePosition.clone().addScaledVector(owner.offset, props.explosion), owner.mesh.quaternion, owner.mesh.scale);
    const localInverse = ownerPlacement.clone().invert();
    let selectedBounds: THREE.Box3 | undefined;
    if (supplement) {
      selectedBounds = supplementalWorldBounds(supplement, props.explosion, runtime.records.get(supplement.anchorPartRef)?.offset).applyMatrix4(localInverse);
      bounds.union(selectedBounds);
      // Frame the illustrative stack and its source opening together, so the
      // outward display separation can be read as a three-dimensional gap.
      for (const item of runtime.supplements.values()) if (item.component.review_ref === supplement.component.review_ref && supplementalComponentEnabled(props.data, item.component, props.showSupplemental === true, props.supplementReviewIds, props.activeConnectionAlternativeIds)) bounds.union(supplementalWorldBounds(item, props.explosion, runtime.records.get(item.anchorPartRef)?.offset).applyMatrix4(localInverse));
      const review = props.data.analysis?.connection_reviews?.find(item => item.id === supplement.component.review_ref);
      for (const participant of review?.participants ?? []) {
        const record = runtime.records.get(participant.part_ref); if (!record) continue;
        const matrix = new THREE.Matrix4().compose(record.basePosition.clone().addScaledVector(record.offset, props.explosion), record.mesh.quaternion, record.mesh.scale);
        const openings = openingGroupsFor(props.data, participant.part_ref).filter(item => item.openings.some(opening => participant.opening_refs.includes(opening.id))).map(item => item.representative);
        for (const opening of openings) for (const point of opening.geometry.boundary_vertices) bounds.expandByPoint(new THREE.Vector3().fromArray(point).applyMatrix4(matrix).applyMatrix4(localInverse));
      }
    }
    else {
      for (const id of selected.contextPartRefs) {
        const peer = runtime.records.get(id); if (!peer?.mesh.geometry.boundingBox) continue;
        const matrix = new THREE.Matrix4().compose(peer.basePosition.clone().addScaledVector(peer.offset, props.explosion), peer.mesh.quaternion, peer.mesh.scale);
        bounds.union(peer.mesh.geometry.boundingBox.clone().applyMatrix4(matrix).applyMatrix4(ownerPlacement.clone().invert()));
      }
    }
    const context = new THREE.Group(); context.userData.featureType = supplement ? 'schematic_component' : 'source_context_bounds';
    context.add(new THREE.Box3Helper((selectedBounds || bounds).clone(), supplement ? '#d6ae54' : '#94b4ad')); group.add(context);
  }
  if (selected.selection.kind === 'hole' || selected.selection.kind === 'pattern') {
    const pattern = props.data.analysis?.feature_patterns?.find(item => item.id === selected.selection.id);
    const holes = props.data.analysis?.logical_holes?.filter(item => item.id === selected.selection.id || pattern?.logical_hole_refs.includes(item.id)) ?? [];
    holes.forEach(hole => group.add(holePortalOverlay(hole, owner.mesh.geometry, bounds, pattern ? new Set(pattern.portal_refs) : undefined)));
    if (pattern) group.add(patternGuideOverlay(pattern, bounds));
  }
  owner.mesh.add(group); runtime.geometryOverlay = group; runtime.geometryLocalBounds = bounds;
  const sameSide = !!selectedSites?.length && selectedSites.every(site => site.side_ref === selectedSites[0].side_ref && new THREE.Vector3().fromArray(site.entry_direction).dot(new THREE.Vector3().fromArray(selectedSites[0].entry_direction)) > .999);
  // A hole's entry vector points inward; a pin's vector points from its base
  // toward its tip. Observe each from its exposed end, without reversing pins
  // into the source housing as if they were holes.
  const siteOutward = sameSide ? selectedSites![0].entry_direction.map(value => value * (selectedSites![0].site_kind === 'integral_pin' ? 1 : -1)) : undefined;
  runtime.geometryAxis = new THREE.Vector3().fromArray(slot ? slot.geometry.normal : siteOutward || (openings.length ? openings[0].geometry.normal : passage ? passage.geometry.axis : selectedPattern ? selectedPattern.geometry.normal : features.length ? features[0].kind === 'planar_patch' ? features[0].geometry.normal : features[0].geometry.axis : [1, -1, 1])).normalize();
  if (supplement) {
    const outward = supplement.axis.clone().negate();
    const tangent = ISO_DIRECTION.clone().addScaledVector(outward, -ISO_DIRECTION.dot(outward));
    if (tangent.lengthSq() < 1e-8) tangent.crossVectors(outward, new THREE.Vector3(0, 0, 1));
    runtime.geometryAxis.copy(outward.add(tangent.normalize()).normalize()).applyQuaternion(owner.mesh.quaternion.clone().invert());
  }
  group.userData.entryFocused = !!selectedPattern || sameSide || !!slot || openings.length > 0 || !!supplement;
  const drawnPeers = new Set<string>();
  for (const peer of selected.peers) {
    const record = runtime.records.get(peer.ownerRef);
    if (!record) continue;
    const peerFeatures = featuresFor(props.data, peer.featureRefs).filter(feature => feature.owner_ref === peer.ownerRef);
    const overlay = new THREE.Group(); overlay.name = `observed-source-geometry:${peer.ownerRef}`; overlay.userData.ownerRef = peer.ownerRef;
    const peerSites = peer.siteRefs ? props.data.analysis?.mounting_sites?.filter(site => peer.siteRefs!.includes(site.id)) : undefined;
    const peerBounds = new THREE.Box3();
    for (const feature of peerFeatures) overlay.add(featureOverlay(feature, record.mesh.geometry, peerBounds, '#348eac', peerSites?.filter(site => site.feature_refs.includes(feature.id)).map(site => site.position)));
    const peerOpenings = props.data.analysis?.circular_openings?.filter(item => peer.openingRefs?.includes(item.id)) ?? [];
    peerOpenings.forEach(opening => overlay.add(openingOverlay(opening, peerBounds, '#348eac')));
    overlay.userData.localBounds = peerBounds;
    record.mesh.add(overlay); runtime.peerGeometryOverlays.push(overlay);
    if (overlay.children.length) drawnPeers.add(peer.ownerRef);
  }
  runtime.geometryOwnerId = selected.ownerRef;
  if (host) {
    const drawn = group.children.filter(object => object.userData.featureType && object.children.length > 0);
    const marker = ({ interface: 'interfaceHighlight', observation: 'observationHighlight', feature: 'featureHighlight', hole: 'holeHighlight', pattern: 'patternHighlight', site: 'siteHighlight', pin_fit: 'pinFitHighlight', mount: 'mountHighlight', mounting_interface: 'mountingInterfaceHighlight', slot: 'slotHighlight', opening: 'openingHighlight', passage: 'passageHighlight', connection_review: 'reviewHighlight', supplement: 'supplementHighlight', legacy_group: 'legacyGroupHighlight', legacy_observation: 'legacyObservationHighlight' } as const)[selected.selection.kind];
    host.dataset[marker] = drawn.length ? selected.selection.id : '';
    if (selected.selection.kind === 'interface') host.dataset.highlightedInterface = host.dataset.interfaceHighlight;
    host.dataset.geometryAuthority = drawn.length ? selected.authority : '';
    host.dataset.geometrySelectionKind = drawn.length ? selected.selection.kind : '';
    host.dataset.geometryPeerOwners = [...drawnPeers].join(',');
    host.dataset.highlightedFeatures = String(drawn.filter(object => ['plane', 'cylinder', 'conical_frustum'].includes(object.userData.featureType)).length);
    host.dataset.geometryFeatureTypes = [...new Set(drawn.map(object => object.userData.featureType))].join(',');
    host.dataset.highlightedPlanes = host.dataset.planeFeatures = String(drawn.filter(object => object.userData.featureType === 'plane').length);
    host.dataset.highlightedCylinders = String(drawn.filter(object => object.userData.featureType === 'cylinder').length);
    host.dataset.highlightedCones = String(drawn.filter(object => object.userData.featureType === 'conical_frustum').length);
    host.dataset.highlightedOpenings = String(drawn.filter(object => object.userData.featureType === 'circular_opening').length);
    host.dataset.geometryContextOnly = String(contextOnly);
    host.dataset.highlightedTriangles = String(drawn.reduce((sum, object) => sum + Number(object.userData.sourceTriangleCount || 0), 0));
    host.dataset.highlightedSupportTriangles = '0';
    let entryRings = 0; group.traverse(object => { if (object.userData.entryRing === true) entryRings += 1; });
    host.dataset.highlightedEntryRings = String(entryRings);
    host.dataset.highlightedSiteEntrances = String(selectedSites?.length ?? 0);
    host.dataset.selectedEntrySide = [...new Set(selectedSites?.map(site => site.side_ref) ?? [])].join(',');
    host.dataset.selectedEntryDirection = sameSide ? selectedSites![0].entry_direction.join(',') : '';
    host.dataset.highlightedPeerSiteEntrances = String(selected.peers.reduce((sum, peer) => sum + (peer.siteRefs?.length ?? 0), 0));
  }
  setGeometryNormalsVisible(runtime, props.showGeometryNormals ?? false);
}

function focusGeometry(runtime: Runtime, props: SceneProps, selection?: GeometrySelection, explicit = true) {
  if (!runtime.ready) return;
  const active = selection || props.selection;
  if (!active) return;
  const key = [active.kind, active.id, active.ownerRef || ''].join('|');
  if (!explicit && runtime.inspectionSuppressedSelection === key) return;
  runtime.inspectionSuppressedSelection = null;
  if (active && (active.kind === 'supplement' || active.id !== runtime.geometryOverlay?.userData.selection?.id || active.ownerRef !== runtime.geometryOverlay?.userData.selection?.ownerRef)) presentGeometry(runtime, props, active);
  const owner = runtime.geometryOwnerId ? runtime.records.get(runtime.geometryOwnerId) : null;
  if (!owner || !runtime.geometryLocalBounds || !runtime.geometryAxis) return;
  const placement = new THREE.Matrix4().compose(owner.basePosition.clone().addScaledVector(owner.offset, props.explosion), owner.mesh.quaternion, owner.mesh.scale);
  const bounds = runtime.geometryLocalBounds.clone().applyMatrix4(placement);
  for (const overlay of runtime.peerGeometryOverlays) {
    const peer = runtime.records.get(overlay.userData.ownerRef), localBounds = overlay.userData.localBounds as THREE.Box3 | undefined;
    if (!peer || !localBounds || localBounds.isEmpty()) continue;
    const matrix = new THREE.Matrix4().compose(peer.basePosition.clone().addScaledVector(peer.offset, props.explosion), peer.mesh.quaternion, peer.mesh.scale);
    bounds.union(localBounds.clone().applyMatrix4(matrix));
  }
  const surface = runtime.geometryOverlay?.userData.surface === true;
  const target = bounds.getCenter(new THREE.Vector3());
  const entryFocused = runtime.geometryOverlay?.userData.entryFocused === true;
  const direction = surface || runtime.geometryOverlay?.userData.featureType === 'source_context_bounds' || (active?.kind === 'mounting_interface' && !entryFocused) ? ISO_DIRECTION.clone() : runtime.geometryAxis.clone().transformDirection(placement);
  if (!surface && runtime.geometryOverlay?.userData.entryFocused !== true && direction.dot(runtime.camera.position.clone().sub(runtime.controls.target)) < 0) direction.negate();
  if (Math.abs(direction.z) > 0.97) direction.add(new THREE.Vector3(0, 0.06, 0)).normalize();
  const previous = runtime.inspection;
  const descriptor = resolveGeometry(props.data, active);
  runtime.inspection = { selection: { ...active }, previousCamera: previous?.previousCamera || actualCamera(runtime), previousView: previous?.previousView || runtime.currentView, previousDirection: previous?.previousDirection || runtime.viewDirection.clone(), contextPartIds: new Set([owner.part.id, ...(descriptor?.contextPartRefs || []), ...(descriptor?.peers.map(item => item.ownerRef) || [])]), translucentPartIds: new Set(), samples: [], contextOnly: runtime.renderer.domElement.parentElement?.dataset.geometryContextOnly === 'true', updatedAt: 0, signature: '' };
  applySourcePresentation(runtime, props);
  runtime.inspection.samples = inspectionSamples(runtime, props, active, runtime.geometryLocalBounds);
  const targets = runtime.inspection.samples.map(sample => sampleWorldPoint(runtime, sample, props.explosion));
  const right = new THREE.Vector3().crossVectors(direction, runtime.camera.up).normalize();
  if (right.lengthSq() < 1e-8) right.set(0, 1, 0);
  const up = new THREE.Vector3().crossVectors(right, direction).normalize();
  const candidates = [direction, direction.clone().addScaledVector(right, .35).normalize(), direction.clone().addScaledVector(right, -.35).normalize(), direction.clone().addScaledVector(up, .3).normalize(), direction.clone().addScaledVector(up, -.3).normalize()];
  const sourceBoxes = [...runtime.records.values()].filter(record => record.mesh.visible && record.mesh.geometry.boundingBox).map(record => {
    const matrix = new THREE.Matrix4().compose(record.basePosition.clone().addScaledVector(record.offset, props.explosion), record.mesh.quaternion, record.mesh.scale);
    return record.mesh.geometry.boundingBox!.clone().applyMatrix4(matrix).expandByScalar(.0001);
  });
  let best: { direction: THREE.Vector3; position: THREE.Vector3; blockers: Set<string>; guardedBounds: number; score: number } | null = null;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    let distance = fitDistance(runtime, bounds, target, candidate, surface ? 1.55 : 1.65, .024);
    const guarded = new Set<THREE.Box3>();
    // Keep the lens outside source solids while retaining a local field of
    // view. Obstruction is handled by temporary translucency, not whole-device
    // framing; AABBs are only this conservative display guard.
    for (let pass = 0; pass <= sourceBoxes.length; pass += 1) {
      const position = target.clone().addScaledVector(candidate, distance);
      const containing = sourceBoxes.filter(box => box.containsPoint(position));
      if (!containing.length) break;
      for (const box of containing) {
        guarded.add(box);
        let exit = Infinity;
        for (const axis of ['x', 'y', 'z'] as const) if (Math.abs(candidate[axis]) > 1e-10) exit = Math.min(exit, ((candidate[axis] > 0 ? box.max[axis] : box.min[axis]) - target[axis]) / candidate[axis]);
        distance = Math.max(distance, exit + Math.max(.0015, exit * .02));
      }
    }
    const position = target.clone().addScaledVector(candidate, distance);
    const visibility = runtime.inspection.contextOnly ? { blockers: new Set<string>(), blockedSamples: 0 } : visibilityObstructions(runtime, props, position, targets, true);
    const score = visibility.blockers.size * .45 + visibility.blockedSamples / Math.max(1, targets.length) * 2 + index * .015;
    if (!best || score < best.score) best = { direction: candidate, position, blockers: visibility.blockers, guardedBounds: guarded.size, score };
    if (index === 0 && !visibility.blockers.size) break;
  }
  if (!best) return;
  runtime.inspection.translucentPartIds = best.blockers;
  applySourcePresentation(runtime, props); inspectionOverlayDepth(runtime, best.blockers.size > 0 || props.xray);
  runtime.viewDirection.copy(best.direction); runtime.flight = { target, position: best.position };
  publishInspection(runtime);
  const host = runtime.renderer.domElement.parentElement;
  if (host) { host.dataset.geometryFocusSelection = active.id; host.dataset.geometryFocusOwner = owner.part.id; host.dataset.geometryCameraGuardedBounds = String(best.guardedBounds); }
}

function labelParts(data: PrototypeData, selectedId: string | null) {
  const chosen: Part[] = [];
  if (selectedId) {
    const selected = data.parts.find(part => part.id === selectedId);
    if (selected) chosen.push(selected);
  }
  for (const key of ['bottom_head_shell', 'xl330', 'trunk_base', 'foot_left']) {
    const part = data.parts.find(item => item.meshKey === key);
    if (part && !chosen.some(item => item.id === part.id)) chosen.push(part);
  }
  return chosen.slice(0, 5);
}

const SceneCanvas = forwardRef<SceneHandle, SceneProps>(function SceneCanvas(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<SVGSVGElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const labelRefs = useRef(new Map<string, HTMLButtonElement>());
  const leaderRefs = useRef(new Map<string, SVGLineElement>());
  const labels = useMemo(() => labelParts(props.data, props.selectedId), [props.data, props.selectedId]);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const [load, setLoad] = useState({ loaded: 0, total: 0, ready: false });
  const [error, setError] = useState<string | null>(null);
  const [inspectionNotice, setInspectionNotice] = useState<InspectionState | null>(null);
  const [missingCount, setMissingCount] = useState(0);

  useImperativeHandle(ref, () => ({
    fitAll() {
      const runtime = runtimeRef.current;
      if (runtime?.ready) { restoreInspection(runtime, propsRef.current); frameBounds(runtime, visibleBounds(runtime, propsRef.current.explosion), runtime.currentView, false, true); }
    },
    focusSelected() {
      const runtime = runtimeRef.current;
      if (runtime?.ready) { restoreInspection(runtime, propsRef.current); frameBounds(runtime, visibleBounds(runtime, propsRef.current.explosion, propsRef.current.selectedId), runtime.currentView, Boolean(propsRef.current.selectedId), true); }
    },
    focusGeometry(selection) {
      const runtime = runtimeRef.current;
      if (runtime) focusGeometry(runtime, propsRef.current, selection || propsRef.current.selection || undefined);
    },
    setView(view) {
      const runtime = runtimeRef.current;
      if (runtime?.ready) { restoreInspection(runtime, propsRef.current); frameBounds(runtime, visibleBounds(runtime, propsRef.current.explosion), view); }
    },
    getCameraPose() {
      const runtime = runtimeRef.current;
      if (!runtime?.ready) return null;
      return {
        position: runtime.camera.position.toArray() as CameraPose['position'],
        target: runtime.controls.target.toArray() as CameraPose['target'],
      };
    },
    getSupplementalDisplay() {
      const runtime = runtimeRef.current;
      return { enabled: propsRef.current.showSupplemental === true || !!propsRef.current.activeConnectionAlternativeIds?.length, referenceEnabled: propsRef.current.showSupplemental === true, activeAlternativeIds: [...propsRef.current.activeConnectionAlternativeIds ?? []], scopeReviewIds: propsRef.current.supplementReviewIds == null ? null : [...propsRef.current.supplementReviewIds], components: [...runtime?.supplements.values() ?? []].map(record => {
        const anchor = runtime?.records.get(record.anchorPartRef);
        return { id: record.component.id, visible: record.group.visible, usage: isAlternativeSupplement(propsRef.current.data, record.component) ? 'unverified_alternative' as const : 'reference_connector' as const, status: record.component.status, domain: record.component.domain, bom_status: record.component.bom_status, position: record.group.position.toArray() as [number, number, number], quaternion: record.group.quaternion.toArray() as [number, number, number, number], displayAnchorPartRef: record.anchorPartRef, displayAnchorOffset: (anchor ? anchor.mesh.position.clone().sub(anchor.basePosition) : new THREE.Vector3()).toArray() as [number, number, number], displayOnly: true as const };
      }) };
    },
    restoreInspection() {
      const runtime = runtimeRef.current;
      if (runtime) restoreInspection(runtime, propsRef.current);
    },
    getInspectionState() { return inspectionState(runtimeRef.current); },
    setCameraPose(pose) {
      const runtime = runtimeRef.current;
      if (!runtime?.ready || !pose) return;
      const validVector = (value: unknown): value is [number, number, number] => Array.isArray(value) && value.length === 3 && value.every(component => typeof component === 'number' && Number.isFinite(component));
      if (!validVector(pose.position) || !validVector(pose.target)) return;
      const position = new THREE.Vector3().fromArray(pose.position);
      const target = new THREE.Vector3().fromArray(pose.target);
      if (position.distanceToSquared(target) < 0.00000001) return;
      runtime.flight = null;
      // Consume any pending orbit inertia before restoring the captured pose.
      const damping = runtime.controls.enableDamping;
      runtime.controls.enableDamping = false;
      runtime.controls.update();
      runtime.controls.enableDamping = damping;
      runtime.camera.position.copy(position);
      runtime.controls.target.copy(target);
      if (runtime.inspection) runtime.inspection.updatedAt = 0;
      runtime.controls.update();
      runtime.viewDirection.copy(runtime.camera.position).sub(runtime.controls.target).normalize();
    },
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setError(null);
    setInspectionNotice(null);
    setMissingCount(0);
    const urls = [...new Set(props.data.parts.map(part => part.geometryUrl))];
    setLoad({ loaded: 0, total: urls.length, ready: false });
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      setError('浏览器暂时无法启动 3D 视图。请启用硬件加速，或使用支持 WebGL 的浏览器。知识与来源仍可浏览。');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor('#f4f7f7');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.localClippingEnabled = true;
    renderer.domElement.className = 'scene-webgl';
    renderer.domElement.setAttribute('aria-label', 'Microduck 可旋转三维参考装配模型');
    renderer.domElement.setAttribute('role', 'img');
    host.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f4f7f7');
    scene.fog = new THREE.Fog('#f4f7f7', 1.5, 4);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.001, 20);
    camera.up.set(0, 0, 1);
    camera.position.set(0.45, -0.65, 0.38);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 0.035;
    controls.maxDistance = 2.4;
    controls.maxPolarAngle = Math.PI * 0.88;
    controls.target.set(0, 0, 0.15);
    controls.update();

    scene.add(new THREE.HemisphereLight('#f6faff', '#b7c2bf', 1.25));
    const keyLight = new THREE.DirectionalLight('#fffaf3', 2.15);
    keyLight.position.set(0.8, -0.6, 1.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -0.55;
    keyLight.shadow.camera.right = keyLight.shadow.camera.top = 0.55;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 3;
    keyLight.shadow.normalBias = 0.0005;
    keyLight.shadow.bias = -0.00003;
    keyLight.shadow.radius = 4;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight('#cfdfec', 0.75);
    fillLight.position.set(-0.7, 0.5, 0.6);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight('#ffffff', 1.25);
    rimLight.position.set(0, 0.6, 0.8);
    scene.add(rimLight);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = new RoomEnvironment();
    const environmentMap = pmrem.fromScene(environment, 0.04);
    scene.environment = environmentMap.texture;
    environment.dispose();
    pmrem.dispose();

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.12, depthWrite: false }));
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = makeGrid();
    scene.add(grid);
    const contactShadow = makeContactShadow();
    scene.add(contactShadow);
    const runtime: Runtime = {
      scene, camera, renderer, controls, records: new Map(), supplements: new Map(), center: new THREE.Vector3(), bounds: new THREE.Box3(),
      grid, floor, contactShadow, clippingPlane: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
      selectedEdge: null, geometryOverlay: null, peerGeometryOverlays: [], geometryLocalBounds: null, geometryAxis: null, geometryOwnerId: null,
      currentView: 'iso', viewDirection: ISO_DIRECTION.clone(), flight: null, width: 1, height: 1, groundTarget: 0, ready: false, disposed: false,
      inspection: null, inspectionSuppressedSelection: null, onInspectionChange: state => { setInspectionNotice(state); propsRef.current.onInspectionChange?.(state); },
    };
    runtimeRef.current = runtime;
    const geometryMap = new Map<string, THREE.BufferGeometry>();
    let frame = 0;
    let loaded = 0;
    const loader = new STLLoader();

    const resize = () => {
      if (runtime.disposed) return;
      const rect = host.getBoundingClientRect();
      const oldWidth = runtime.width;
      const oldHeight = runtime.height;
      runtime.width = Math.max(1, rect.width);
      runtime.height = Math.max(1, rect.height);
      camera.aspect = runtime.width / runtime.height;
      camera.updateProjectionMatrix();
      renderer.setSize(runtime.width, runtime.height, false);
      if (runtime.ready && (Math.abs(oldWidth - runtime.width) > oldWidth * 0.15 || Math.abs(oldHeight - runtime.height) > oldHeight * 0.15)) {
        if (propsRef.current.selection) focusGeometry(runtime, propsRef.current, propsRef.current.selection, false);
        else frameBounds(runtime, visibleBounds(runtime, propsRef.current.explosion));
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    controls.addEventListener('start', () => { runtime.flight = null; if (runtime.inspection) runtime.inspection.updatedAt = 0; });

    const drawLabels = () => {
      const occupied: { x: number; y: number; w: number; h: number }[] = [];
      for (const part of labelsRef.current) {
        const element = labelRefs.current.get(part.id);
        const leader = leaderRefs.current.get(part.id);
        const record = runtime.records.get(part.id);
        if (!element || !leader) continue;
        if (!propsRef.current.showLabels || !record?.mesh.visible || !runtime.ready) {
          element.style.opacity = '0'; leader.style.opacity = '0'; element.style.pointerEvents = 'none';
          continue;
        }
        const center = record.mesh.geometry.boundingBox?.getCenter(TEMP_POSITION) ?? TEMP_POSITION.set(0, 0, 0);
        record.mesh.localToWorld(center);
        const projected = center.project(camera);
        if (projected.z > 1 || projected.z < -1) {
          element.style.opacity = '0'; leader.style.opacity = '0'; element.style.pointerEvents = 'none';
          continue;
        }
        const anchorX = (projected.x * 0.5 + 0.5) * runtime.width;
        const anchorY = (-projected.y * 0.5 + 0.5) * runtime.height;
        const width = Math.min(element.offsetWidth || 140, runtime.width - 28);
        const height = element.offsetHeight || 42;
        const onRight = anchorX > runtime.width * 0.48;
        const candidates = [
          [onRight ? 32 : -width - 32, -30], [onRight ? 44 : -width - 44, 28],
          [onRight ? -width - 32 : 32, -55], [onRight ? 28 : -width - 28, 66],
          [onRight ? -width - 28 : 28, 18],
        ];
        let placed: { x: number; y: number; w: number; h: number } | null = null;
        for (const [dx, dy] of candidates) {
          const x = THREE.MathUtils.clamp(anchorX + dx, 18, Math.max(18, runtime.width - width - 18));
          const y = THREE.MathUtils.clamp(anchorY + dy, 60, Math.max(60, runtime.height - height - 100));
          const box = { x, y, w: width, h: height };
          if (!occupied.some(other => box.x < other.x + other.w + 8 && box.x + box.w + 8 > other.x && box.y < other.y + other.h + 8 && box.y + box.h + 8 > other.y)) { placed = box; break; }
        }
        if (!placed) { element.style.opacity = '0'; leader.style.opacity = '0'; element.style.pointerEvents = 'none'; continue; }
        occupied.push(placed);
        element.style.transform = `translate3d(${Math.round(placed.x)}px,${Math.round(placed.y)}px,0)`;
        element.style.opacity = '1';
        element.style.pointerEvents = 'auto';
        const endX = placed.x > anchorX ? placed.x : placed.x + placed.w;
        leader.setAttribute('x1', String(anchorX)); leader.setAttribute('y1', String(anchorY));
        leader.setAttribute('x2', String(endX)); leader.setAttribute('y2', String(placed.y + placed.h / 2));
        leader.style.opacity = '1';
      }
    };

    const axisQuaternion = new THREE.Quaternion();
    const axisVector = new THREE.Vector3();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate = () => {
      if (runtime.disposed) return;
      frame = requestAnimationFrame(animate);
      const latest = propsRef.current;
      const factor = THREE.MathUtils.clamp(latest.explosion, 0, 1);
      for (const record of runtime.records.values()) {
        const target = record.basePosition.clone().addScaledVector(record.offset, factor);
        const distance = record.mesh.position.distanceToSquared(target);
        if (distance > 0) renderer.shadowMap.needsUpdate = true;
        if (distance < 0.0000000001) record.mesh.position.copy(target);
        else record.mesh.position.lerp(target, reduceMotion ? 1 : 0.12);
      }
      for (const record of runtime.supplements.values()) {
        const target = supplementalPosition(record, factor, runtime.records.get(record.anchorPartRef)?.offset);
        if (record.group.position.distanceToSquared(target) < 1e-10) record.group.position.copy(target);
        else record.group.position.lerp(target, reduceMotion ? 1 : .12);
      }
      if (runtime.geometryOwnerId && runtime.geometryLocalBounds) {
        const owner = runtime.records.get(runtime.geometryOwnerId);
        if (owner) { const center = runtime.geometryLocalBounds.getCenter(new THREE.Vector3()).multiply(owner.mesh.scale).applyQuaternion(owner.mesh.quaternion).add(owner.mesh.position).toArray().join(','); host.dataset.geometryWorldCenter = center; if (runtime.geometryOverlay?.userData.authority === 'mechanism_candidate') host.dataset.interfaceWorldCenter = center; if (runtime.geometryOverlay?.userData.selection?.kind === 'observation') host.dataset.observationWorldCenter = center; }
      }
      if (runtime.ready) {
        host.dataset.sourcePlacement = factor !== 0 ? 'exploded' : [...runtime.records.values()].every(record => record.mesh.position.equals(record.basePosition)) ? 'restored' : 'transitioning';
        host.dataset.supplementalDisplayPlacement = factor !== 0 ? 'exploded' : [...runtime.supplements.values()].every(record => record.group.position.equals(record.basePosition)) ? 'restored' : 'transitioning';
        host.dataset.supplementalWorldPositions = JSON.stringify([...runtime.supplements.values()].map(record => ({ id: record.component.id, position: record.group.position.toArray(), displayAnchor: record.anchorPartRef })));
      }
      if (runtime.ready && Math.abs(floor.position.z - runtime.groundTarget) > 0.000001) {
        floor.position.z = THREE.MathUtils.lerp(floor.position.z, runtime.groundTarget, reduceMotion ? 1 : 0.12);
        grid.position.z = floor.position.z + 0.0001;
        contactShadow.position.z = floor.position.z + 0.0002;
        renderer.shadowMap.needsUpdate = true;
      }
      if (runtime.flight) {
        camera.position.lerp(runtime.flight.position, reduceMotion ? 1 : 0.12);
        controls.target.lerp(runtime.flight.target, reduceMotion ? 1 : 0.12);
        if (camera.position.distanceToSquared(runtime.flight.position) < 0.00000001 && controls.target.distanceToSquared(runtime.flight.target) < 0.00000001) {
          camera.position.copy(runtime.flight.position); controls.target.copy(runtime.flight.target); runtime.flight = null;
        }
      }
      controls.update();
      updateInspectionVisibility(runtime, latest);
      // Keep precision near the inspected device instead of spending almost
      // the entire depth range on a fixed 1 mm–20 m camera frustum.
      const near = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * .02, .0001, .01);
      if (Math.abs(camera.near - near) > near * .01 || camera.far !== 4) {
        camera.near = near; camera.far = 4; camera.updateProjectionMatrix();
      }
      host.dataset.depthNear = String(camera.near);
      host.dataset.depthFar = String(camera.far);
      host.dataset.contactDepthPolicy = 'opaque-actuator-priority';
      renderer.render(scene, camera);
      host.dataset.cameraFlight = runtime.flight ? 'active' : 'settled';
      if (runtime.geometryOwnerId && runtime.geometryLocalBounds) {
        const owner = runtime.records.get(runtime.geometryOwnerId);
        if (owner) {
          const corners = boxCorners(runtime.geometryLocalBounds).map(point => point.applyMatrix4(owner.mesh.matrixWorld));
          for (const overlay of runtime.peerGeometryOverlays) {
            const localBounds = overlay.userData.localBounds as THREE.Box3 | undefined;
            if (localBounds && !localBounds.isEmpty() && overlay.parent) corners.push(...boxCorners(localBounds).map(point => point.applyMatrix4(overlay.parent!.matrixWorld)));
          }
          const projected = corners.map(point => point.project(camera));
          const extent = new THREE.Box3().setFromPoints(projected);
          host.dataset.geometryProjectedBounds = JSON.stringify([extent.min.x, extent.min.y, extent.max.x, extent.max.y, extent.min.z, extent.max.z]);
          host.dataset.geometryFrustumInside = String(projected.every(point => Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 && point.z >= -1 && point.z <= 1));
          if (runtime.geometryAxis) {
            const outward = runtime.geometryAxis.clone().transformDirection(owner.mesh.matrixWorld);
            host.dataset.geometryCameraFacing = String(camera.position.clone().sub(controls.target).normalize().dot(outward));
          }
        }
      }
      drawLabels();
      if (axisRef.current) {
        camera.getWorldQuaternion(axisQuaternion).invert();
        for (const [name, vector] of [['x', [1, 0, 0]], ['y', [0, 1, 0]], ['z', [0, 0, 1]]] as const) {
          axisVector.set(vector[0], vector[1], vector[2]).applyQuaternion(axisQuaternion);
          const x = 25 + axisVector.x * 17;
          const y = 25 - axisVector.y * 17;
          const line = axisRef.current.querySelector(`[data-axis-line="${name}"]`);
          const label = axisRef.current.querySelector(`[data-axis-text="${name}"]`);
          line?.setAttribute('x2', String(x)); line?.setAttribute('y2', String(y));
          label?.setAttribute('x', String(x + Math.sign(axisVector.x || 1) * 5));
          label?.setAttribute('y', String(y - Math.sign(axisVector.y || 1) * 5 + 3));
        }
      }
    };
    animate();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down: { x: number; y: number } | null = null;
    const hit = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const objects = [...runtime.records.values()].filter(record => record.mesh.visible).map(record => record.mesh);
      const intersections = [...raycaster.intersectObjects(objects, false), ...raycaster.intersectObjects([...runtime.supplements.values()].filter(record => record.group.visible).map(record => record.group), true)].sort((a, b) => a.distance - b.distance);
      const picked = intersections.find(item => !propsRef.current.clipping || runtime.clippingPlane.distanceToPoint(item.point) >= 0);
      return picked ? { partId: picked.object.userData.partId as string | undefined, supplementId: picked.object.userData.supplementId as string | undefined } : undefined;
    };
    const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; };
    const pointerUp = (event: PointerEvent) => {
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 5) {
        const item = hit(event);
        if (item?.supplementId) propsRef.current.onSelectSupplement?.(item.supplementId);
        else if (item?.partId) propsRef.current.onSelect(item.partId);
      }
      down = null;
    };
    const pointerMove = (event: PointerEvent) => { if (!down) renderer.domElement.style.cursor = hit(event) ? 'pointer' : 'grab'; };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.domElement.addEventListener('pointermove', pointerMove);

    void Promise.allSettled(urls.map(async url => {
      const geometry = await loader.loadAsync(url);
      if (runtime.disposed) { geometry.dispose(); return; }
      geometry.computeBoundingBox();
      geometry.computeVertexNormals();
      geometryMap.set(url, geometry);
      loaded += 1;
      setLoad({ loaded, total: urls.length, ready: false });
      propsRef.current.onLoadProgress?.(loaded, urls.length);
    })).then(results => {
      if (runtime.disposed) return;
      let missing = 0;
      for (const part of props.data.parts) {
        const geometry = geometryMap.get(part.geometryUrl);
        if (!geometry) { missing += 1; continue; }
        const color = new THREE.Color(PALETTE[part.kind] ?? PALETTE.other);
        const material = new THREE.MeshStandardMaterial({
          color, roughness: part.kind === 'bearing' ? 0.3 : 0.55,
          metalness: part.kind === 'bearing' ? 0.6 : part.kind === 'actuator' ? 0.23 : 0.06,
          envMapIntensity: 0.46, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.fromArray(part.position);
        mesh.quaternion.fromArray(part.quaternion).normalize();
        mesh.scale.fromArray(part.scale);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = part.name;
        mesh.userData.partId = part.id;
        mesh.updateMatrixWorld(true);
        scene.add(mesh);
        const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
        mesh.localToWorld(center);
        runtime.bounds.union(geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
        runtime.records.set(part.id, { part, mesh, basePosition: new THREE.Vector3().fromArray(part.position), center, offset: new THREE.Vector3(), color });
      }
      if (runtime.records.size === 0) {
        setError('没有成功载入可显示的来源几何。请检查本地材料是否准备完整，再刷新页面。');
        setLoad({ loaded, total: urls.length, ready: true });
        return;
      }
      runtime.bounds.getCenter(runtime.center);
      runtime.supplements = makeSupplementalScene(props.data);
      for (const record of runtime.supplements.values()) { record.group.position.copy(supplementalPosition(record, propsRef.current.explosion, runtime.records.get(record.anchorPartRef)?.offset)); scene.add(record.group); }
      runtime.clippingPlane.constant = runtime.center.y;
      for (const record of runtime.records.values()) {
        record.offset.copy(explosionOffset(record, runtime.center));
        record.mesh.position.copy(record.basePosition).addScaledVector(record.offset, propsRef.current.explosion);
      }
      const groundZ = visibleBounds(runtime, propsRef.current.explosion).min.z - 0.001;
      runtime.groundTarget = groundZ;
      floor.position.z = groundZ;
      grid.position.set(runtime.center.x, runtime.center.y, groundZ + 0.0001);
      contactShadow.position.set(runtime.center.x, runtime.center.y, groundZ + 0.0002);
      runtime.ready = true;
      host.dataset.renderedInstances = String(runtime.records.size);
      host.dataset.sourceInstances = String(props.data.parts.length);
      presentation(runtime, propsRef.current);
      presentGeometry(runtime, propsRef.current);
      frameBounds(runtime, visibleBounds(runtime, propsRef.current.explosion), 'iso');
      setMissingCount(missing);
      setLoad({ loaded, total: urls.length, ready: true });
      if (results.some(result => result.status === 'rejected')) console.warn('Some source meshes could not be loaded. The scene is partial.');
      propsRef.current.onReady?.();
    });

    return () => {
      runtime.disposed = true;
      if (runtimeRef.current === runtime) runtimeRef.current = null;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      for (const record of runtime.records.values()) record.mesh.material.dispose();
      disposeSupplementalScene(runtime.supplements);
      clearGeometryOverlay(runtime);
      for (const geometry of geometryMap.values()) geometry.dispose();
      if (runtime.selectedEdge) {
        runtime.selectedEdge.geometry.dispose();
        (runtime.selectedEdge.material as THREE.Material).dispose();
      }
      grid.geometry.dispose(); (grid.material as THREE.Material).dispose();
      floor.geometry.dispose(); (floor.material as THREE.Material).dispose();
      contactShadow.geometry.dispose();
      (contactShadow.material as THREE.MeshBasicMaterial).map?.dispose();
      (contactShadow.material as THREE.Material).dispose();
      environmentMap.dispose();
      keyLight.shadow.map?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [props.data]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime?.ready) presentation(runtime, props);
  }, [props.selectedId, props.selection, props.hiddenIds, props.isolateId, props.xray, props.clipping, props.showGrid, props.showSupplemental, props.supplementReviewIds, props.activeConnectionAlternativeIds]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime?.ready) { if (!props.selection) restoreInspection(runtime, props); presentGeometry(runtime, props); }
  }, [props.selection, props.data, props.showSupplemental, props.supplementReviewIds, props.activeConnectionAlternativeIds]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime?.ready) setGeometryNormalsVisible(runtime, props.showGeometryNormals ?? false);
  }, [props.showGeometryNormals]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime?.ready) return;
    const bounds = visibleBounds(runtime, props.explosion);
    if (bounds.isEmpty()) return;
    runtime.groundTarget = bounds.min.z - 0.001;
    if (props.selection) focusGeometry(runtime, props, props.selection, false);
    else frameBounds(runtime, bounds, runtime.currentView, false, true);
  }, [props.explosion]);

  return <div className="scene-canvas" ref={hostRef} data-scene-ready={load.ready && !error ? 'true' : 'false'}>
    <div className="scene-soft-glow" aria-hidden="true" />
    {inspectionNotice?.active && <div className={`scene-inspection-notice ${inspectionNotice.mode === 'through_geometry' ? 'is-through' : ''}`} role="status"><span>局部查看{inspectionNotice.mode === 'through_geometry' ? ` · 透视查看（临时淡化 ${inspectionNotice.translucentPartIds.length} 件）` : inspectionNotice.mode === 'context_only' ? ' · 局部机制待定位' : ''}</span><button type="button" onClick={() => { const runtime = runtimeRef.current; if (runtime) restoreInspection(runtime, propsRef.current); }}>恢复视图</button></div>}
    <svg className="scene-leaders" aria-hidden="true">
      {labels.map(part => <line key={part.id} ref={element => { if (element) leaderRefs.current.set(part.id, element); else leaderRefs.current.delete(part.id); }} className={props.selectedId === part.id ? 'is-selected' : ''} />)}
    </svg>
    <div className="scene-object-labels" aria-hidden={!props.showLabels}>
      {labels.map(part => <button
        key={part.id}
        type="button"
        tabIndex={props.showLabels && load.ready ? 0 : -1}
        className={`scene-object-label ${props.selectedId === part.id ? 'is-selected' : ''}`}
        ref={element => { if (element) labelRefs.current.set(part.id, element); else labelRefs.current.delete(part.id); }}
        onClick={() => props.onSelect(part.id)}
        aria-label={`定位 ${part.name}`}
      ><span className="scene-label-dot" /><span><strong>{part.name}</strong><small>{part.id}</small></span></button>)}
    </div>
    {!load.ready && !error && <div className="scene-loading" role="status">
      <div className="scene-loading-symbol"><span /><span /><span /></div>
      <strong>正在展开设备世界</strong>
      <span>载入真实来源几何 · {load.loaded} / {load.total || props.data.meta.counts.geometries}</span>
      <div className="scene-loading-track"><i style={{ width: `${Math.round((load.loaded / Math.max(1, load.total)) * 100)}%` }} /></div>
    </div>}
    {error && <div className="scene-error" role="alert"><span>3D 视图暂不可用</span><p>{error}</p><button type="button" onClick={() => window.location.reload()}>重新载入</button></div>}
    {missingCount > 0 && !error && <div className="scene-partial" role="status">{missingCount} 个来源实例暂未显示 · 装配视图不完整</div>}
    <svg className="scene-axis" viewBox="0 0 50 50" ref={axisRef} aria-label="随视角变化的右手坐标轴，Z 为模型上方">
      <circle cx="25" cy="25" r="2" fill="#a3b4b6" />
      {['x', 'y', 'z'].map(axis => <g key={axis} className={`scene-axis-${axis}`}><line x1="25" y1="25" x2="25" y2="25" data-axis-line={axis} /><text x="25" y="25" data-axis-text={axis}>{axis.toUpperCase()}</text></g>)}
    </svg>
  </div>;
});

export default SceneCanvas;
