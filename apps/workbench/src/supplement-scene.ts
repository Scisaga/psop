import * as THREE from 'three';
import type { PrototypeData, SupplementalComponent } from './types';

export interface SupplementalRecord {
  component: SupplementalComponent;
  group: THREE.Group;
  basePosition: THREE.Vector3;
  axis: THREE.Vector3;
  anchorPartRef: string;
  localBounds: THREE.Box3;
}
const AMBER = '#ba9955';
export function makeSupplementalScene(data: PrototypeData) {
  const records = new Map<string, SupplementalRecord>();
  for (const component of data.analysis?.supplemental_components ?? []) {
    const group = new THREE.Group();
    group.name = `supplemental-schematic:${component.id}`;
    const material = new THREE.MeshStandardMaterial({ color: AMBER, roughness: .43, metalness: .4, transparent: true, opacity: .88, side: THREE.DoubleSide });
    const geometry = component.geometry;
    if (geometry.type === 'screw') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(geometry.shaft_radius_m, geometry.shaft_radius_m, geometry.shaft_length_m, 32), material);
      shaft.rotation.x = Math.PI / 2; shaft.position.z = geometry.shaft_length_m / 2; group.add(shaft);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(geometry.head_radius_m, geometry.head_radius_m, geometry.head_length_m, 32), material);
      head.rotation.x = Math.PI / 2; head.position.z = -geometry.head_length_m / 2; group.add(head);
      const groove = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-geometry.head_radius_m * .55, 0, -geometry.head_length_m - .00001), new THREE.Vector3(geometry.head_radius_m * .55, 0, -geometry.head_length_m - .00001),
        new THREE.Vector3(0, -geometry.head_radius_m * .55, -geometry.head_length_m - .00001), new THREE.Vector3(0, geometry.head_radius_m * .55, -geometry.head_length_m - .00001),
      ]), new THREE.LineBasicMaterial({ color: '#826e43', transparent: true, opacity: .7 }));
      group.add(groove);
    } else {
      const shape = new THREE.Shape(); shape.absarc(0, 0, geometry.outer_radius_m, 0, Math.PI * 2, false);
      const hole = new THREE.Path(); hole.absarc(0, 0, geometry.inner_radius_m, 0, Math.PI * 2, true); shape.holes.push(hole);
      const cap = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: geometry.thickness_m, steps: 1, bevelEnabled: false, curveSegments: 40 }), material);
      cap.position.z = -geometry.thickness_m / 2; group.add(cap);
    }
    group.traverse(object => { object.userData.supplementId = component.id; });
    const localBounds = new THREE.Box3().setFromObject(group);
    const review = data.analysis?.connection_reviews?.find(item => item.id === component.review_ref);
    // Follow the declared entry carrier for presentation separation. Older
    // schematics retain their historical opening-owner fallback. This does
    // not assign a physical frame to an unconfirmed third component.
    const anchor = component.insertion?.entry_part_ref || review?.participants.find(item => item.opening_refs.length)?.part_ref || review?.participants[0]?.part_ref || '';
    group.position.fromArray(component.pose.position); group.quaternion.fromArray(component.pose.quaternion).normalize(); group.scale.fromArray(component.pose.scale);
    const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion).normalize();
    records.set(component.id, { component, group, basePosition: group.position.clone(), axis, anchorPartRef: anchor, localBounds });
  }
  return records;
}
export function supplementalPosition(record: SupplementalRecord, factor: number, anchorOffset?: THREE.Vector3) {
  const offset = anchorOffset || new THREE.Vector3();
  // Presentation separation along the illustrative axis, not an assembly path.
  const geometry = record.component.geometry;
  const separation = geometry.type === 'cap'
    ? THREE.MathUtils.clamp(geometry.thickness_m * 3 + geometry.outer_radius_m * .5, .003, .008)
    : THREE.MathUtils.clamp(geometry.shaft_length_m * 1.4 + geometry.head_length_m * 2, .006, .018);
  return record.basePosition.clone().addScaledVector(offset, factor).addScaledVector(record.axis, -factor * separation);
}
export function supplementalWorldBounds(record: SupplementalRecord, factor: number, anchorOffset?: THREE.Vector3) {
  return record.localBounds.clone().applyMatrix4(new THREE.Matrix4().compose(supplementalPosition(record, factor, anchorOffset), record.group.quaternion, record.group.scale));
}
export function disposeSupplementalScene(records: Map<string, SupplementalRecord>) {
  for (const record of records.values()) {
    record.group.parent?.remove(record.group);
    const materials = new Set<THREE.Material>();
    record.group.traverse(object => {
      const drawable = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      drawable.geometry?.dispose(); if (drawable.material) materials.add(drawable.material);
    });
    materials.forEach(material => material.dispose());
  }
}
