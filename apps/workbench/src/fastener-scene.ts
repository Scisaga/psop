import * as THREE from 'three';
import type { FastenerView } from './fastener-model';

export interface FastenerPick {
  pathRef: string;
  connectionRef: string;
  ownerRef: string;
  interfaceRef: string;
  memberRef: string;
}
export interface FastenerRecord {
  view: FastenerView;
  group: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  pick: FastenerPick;
}
export interface FastenerScene {
  records: Map<string, FastenerRecord>;
  pickables: THREE.Mesh[];
  geometry: THREE.CylinderGeometry;
  disposed: boolean;
}

/** Unit cylinders are shared; transforms carry symbolic dimensions and placement. */
export function makeFastenerScene(views: FastenerView[], parentForOwner: (ownerRef: string) => THREE.Object3D | undefined): FastenerScene {
  const handle: FastenerScene = { records: new Map(), pickables: [], geometry: new THREE.CylinderGeometry(1, 1, 1, 20), disposed: false };
  for (const view of views) {
    if (handle.records.has(view.id)) continue;
    const parent = parentForOwner(view.ownerRef);
    if (!parent) continue;
    const group = new THREE.Group();
    group.name = view.label;
    group.position.fromArray(view.entryPosition);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().fromArray(view.inwardAxis));
    const pick: FastenerPick = { pathRef: view.id, connectionRef: view.connectionRef, ownerRef: view.ownerRef, interfaceRef: view.entryInterfaceRef, memberRef: view.entryMemberRef };
    group.userData.fastener = pick;
    const materials: THREE.MeshStandardMaterial[] = [];
    for (const kind of ['head', 'shaft'] as const) {
      const material = new THREE.MeshStandardMaterial({ color: '#87969c', metalness: .25, roughness: .58 });
      materials.push(material);
      const mesh = new THREE.Mesh(handle.geometry, material);
      if (kind === 'head') {
        mesh.scale.set(view.display.headRadiusM, view.display.headHeightM, view.display.headRadiusM);
        mesh.position.y = -view.display.headHeightM / 2;
      } else {
        mesh.scale.set(view.display.shaftRadiusM, view.display.shaftLengthM, view.display.shaftRadiusM);
        mesh.position.y = view.display.shaftLengthM / 2;
      }
      mesh.name = `${view.label} · ${kind}`;
      mesh.userData.fastener = pick;
      mesh.userData.representation = 'schematic';
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh); handle.pickables.push(mesh);
    }
    parent.add(group); handle.records.set(view.id, { view, group, materials, pick });
  }
  return handle;
}

export function presentFasteners(handle: FastenerScene, options: { visible: boolean; explosion: number; selectedPathRef?: string; clippingPlanes?: THREE.Plane[]; distanceM?: number }) {
  if (handle.disposed) return;
  const amount = Number.isFinite(options.explosion) ? Math.max(0, Math.min(1, options.explosion)) : 0;
  for (const record of handle.records.values()) {
    const { view, group } = record;
    group.visible = options.visible;
    group.position.fromArray(view.entryPosition).addScaledVector(new THREE.Vector3().fromArray(view.inwardAxis), -amount * (options.distanceM ?? .012));
    for (const material of record.materials) {
      material.color.set(options.selectedPathRef === view.id ? '#ce9b38' : '#87969c');
      material.emissive.set(options.selectedPathRef === view.id ? '#4b3309' : '#000000');
      material.emissiveIntensity = options.selectedPathRef === view.id ? .12 : 0;
      material.clippingPlanes = options.clippingPlanes ?? [];
    }
  }
}

export function fastenerPickMetadata(object: THREE.Object3D): FastenerPick | null {
  let candidate: THREE.Object3D | null = object;
  while (candidate) {
    const metadata = candidate.userData.fastener as FastenerPick | undefined;
    if (metadata) return metadata;
    candidate = candidate.parent;
  }
  return null;
}

export function fastenerBounds(handle: FastenerScene): THREE.Box3 {
  const result = new THREE.Box3();
  if (!handle.disposed) for (const record of handle.records.values()) if (worldVisible(record.group)) {
    record.group.updateWorldMatrix(true, true);
    result.union(new THREE.Box3().setFromObject(record.group));
  }
  return result;
}

function worldVisible(object: THREE.Object3D) {
  let candidate: THREE.Object3D | null = object;
  while (candidate) { if (!candidate.visible) return false; candidate = candidate.parent; }
  return true;
}

export function fastenerPickables(handle: FastenerScene): THREE.Mesh[] {
  return handle.disposed ? [] : handle.pickables.filter(worldVisible);
}

export function disposeFasteners(handle: FastenerScene) {
  if (handle.disposed) return;
  for (const record of handle.records.values()) {
    record.group.removeFromParent();
    record.materials.forEach(material => material.dispose());
  }
  handle.geometry.dispose(); handle.records.clear(); handle.pickables.length = 0; handle.disposed = true;
}
