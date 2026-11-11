import { Box3, Quaternion, Vector3 } from 'three';
import type { Body, Joint, Part } from './types';

export interface ExplosionPart { part: Part; bounds: Box3 }
interface LayoutPart extends ExplosionPart { center: Vector3; size: Vector3; offset: Vector3 }
interface LayoutBody {
  name: string; parent: string | null; group: string; bounds: Box3; parts: LayoutPart[];
  offset: Vector3; pivot: Vector3; core: Set<LayoutPart>; axis: Vector3 | null;
}
interface LayoutBranch { root: LayoutBody; nodes: LayoutBody[]; bounds: Box3; offset: Vector3 }

const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
const COMPONENTS = ['x', 'y', 'z'] as const;
const center = (box: Box3) => box.getCenter(new Vector3());
const volume = (size: Vector3) => size.x * size.y * size.z;

// Find the first free interval along a ray, rather than pushing past every
// obstacle on that ray. Expanded AABBs also separate nested/hollow source parts.
function clearance(boxes: Box3[], obstacles: Box3[], direction: Vector3, gap: number): number {
  const intervals: [number, number][] = [];
  for (const box of boxes) for (const obstacle of obstacles) {
    let enter = -Infinity, leave = Infinity;
    for (const key of COMPONENTS) {
      const low = obstacle.min[key] - gap - box.max[key];
      const high = obstacle.max[key] + gap - box.min[key];
      const speed = direction[key];
      if (Math.abs(speed) < 1e-12) {
        if (low >= 0 || high <= 0) { leave = -Infinity; break; }
      } else {
        enter = Math.max(enter, Math.min(low / speed, high / speed));
        leave = Math.min(leave, Math.max(low / speed, high / speed));
      }
    }
    if (leave > 0 && leave > enter) intervals.push([enter, leave]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let distance = 0;
  for (const [enter, leave] of intervals) {
    if (enter > distance) break;
    distance = Math.max(distance, leave + gap * 1e-6);
  }
  return distance;
}

function directed(axis: Vector3, delta: Vector3, fallback: Vector3, gap: number): Vector3 {
  const projection = delta.dot(axis), side = Math.abs(projection) > gap * .05 ? projection : fallback.dot(axis);
  return axis.clone().multiplyScalar(side < 0 ? -1 : 1);
}

function partDirection(part: LayoutPart, node: LayoutBody, outward: Vector3, gap: number): Vector3 {
  const delta = part.center.clone().sub(node.pivot);
  const dimensions = COMPONENTS.map((key, axis) => ({ axis, size: part.size[key] })).sort((a, b) => a.size - b.size);
  const thin = dimensions[0];
  // Covers, bearings and flat structural parts open along their thickness.
  // A motor inside a long leg bracket must not be pushed down the leg just
  // because the bracket's centre lies above it.
  if (part.part.kind === 'bearing' || part.part.kind === 'shell' || thin.size < dimensions[1].size * .7) {
    return directed(AXES[thin.axis], delta, outward, gap);
  }
  if (node.axis) return directed(node.axis, delta, outward, gap);
  const scores = COMPONENTS.map(key => Math.abs(delta[key]) / Math.max(part.size[key], gap));
  const axis = Math.max(...scores) < .05 ? thin.axis : scores.indexOf(Math.max(...scores));
  return directed(AXES[axis], delta, outward, gap);
}

function attachment(parent: LayoutBody, child: LayoutBody, bodies: Map<string, Body>): LayoutPart {
  const location = bodies.get(child.name)?.position;
  const point = location ? new Vector3().fromArray(location) : center(child.bounds);
  const mechanical = parent.parts.filter(part => part.part.kind !== 'shell' && part.part.kind !== 'electronics');
  return [...(mechanical.length ? mechanical : parent.parts)].sort((a, b) =>
    a.bounds.distanceToPoint(point) - b.bounds.distanceToPoint(point)
    || a.center.distanceToSquared(point) - b.center.distanceToSquared(point)
    || a.part.meshKey.localeCompare(b.part.meshKey))[0];
}

/** A display heuristic in world space, not a verified disassembly path. */
export function planExplosion(entries: ExplosionPart[], bodies: Body[], joints: Joint[] = []): Map<string, Vector3> {
  const result = new Map<string, Vector3>();
  const all = new Box3();
  const valid = entries.filter(entry => !entry.bounds.isEmpty() && [...entry.bounds.min.toArray(), ...entry.bounds.max.toArray()].every(Number.isFinite));
  for (const entry of entries) result.set(entry.part.id, new Vector3());
  for (const entry of valid) all.union(entry.bounds);
  if (all.isEmpty()) return result;
  const size = all.getSize(new Vector3()), gap = Math.max(size.x, size.y, size.z) * .012;
  if (!gap) return result;

  const nodes = new Map<string, LayoutBody>();
  const sourceBodies = new Map(bodies.map(body => [body.name, body]));
  const sourceJoints = new Map(joints.map(joint => [joint.body, joint]));
  for (const entry of valid) {
    const name = entry.part.body, body = sourceBodies.get(name);
    let node = nodes.get(name);
    if (!node) {
      const joint = sourceJoints.get(name);
      const axis = joint ? new Vector3().fromArray(joint.axis) : null;
      if (axis && body?.quaternion) axis.applyQuaternion(new Quaternion().fromArray(body.quaternion).normalize());
      node = {
        name, parent: body?.parent || null, group: entry.part.group, bounds: new Box3(), parts: [],
        offset: new Vector3(), pivot: new Vector3(), core: new Set(), axis: axis?.lengthSq() ? axis.normalize() : null,
      };
      nodes.set(name, node);
    }
    node.bounds.union(entry.bounds);
    node.parts.push({ ...entry, center: center(entry.bounds), size: entry.bounds.getSize(new Vector3()), offset: new Vector3() });
  }
  const bodyOrder = new Map(bodies.map((body, i) => [body.name, i]));
  const ordered = [...nodes.values()].sort((a, b) => (bodyOrder.get(a.name) ?? Infinity) - (bodyOrder.get(b.name) ?? Infinity) || a.name.localeCompare(b.name));
  for (const node of ordered) {
    // Empty intermediary bodies still carry a hierarchy, even if they have no
    // display mesh in this snapshot.
    const seen = new Set([node.name]);
    while (node.parent && !nodes.has(node.parent) && !seen.has(node.parent)) {
      seen.add(node.parent); node.parent = sourceBodies.get(node.parent)?.parent || null;
    }
    const motors = node.parts.filter(part => part.part.kind === 'actuator');
    const origin = sourceBodies.get(node.name)?.position;
    const pivot = origin ? new Vector3().fromArray(origin) : center(node.bounds);
    const structural = node.parts.filter(part => !['shell', 'bearing', 'electronics'].includes(part.part.kind));
    const anchor = [...(structural.length ? structural : node.parts)].sort((a, b) =>
      a.bounds.distanceToPoint(pivot) - b.bounds.distanceToPoint(pivot)
      || a.center.distanceToSquared(pivot) - b.center.distanceToSquared(pivot)
      || volume(b.size) - volume(a.size) || a.part.meshKey.localeCompare(b.part.meshKey))[0];
    node.core = new Set(motors.length ? motors : [anchor]);
    const coreBounds = new Box3(); for (const part of node.core) coreBounds.union(part.bounds);
    node.pivot.copy(center(coreBounds));
  }
  const root = ordered.find(node => !nodes.has(node.parent || ''));
  const origin = root ? root.pivot : center(all);
  const branches = new Map<string, LayoutBranch>(), branchFor = new Map<string, LayoutBranch>();
  for (const node of ordered) {
    let top = node; const seen = new Set([top.name]);
    while (top.parent) {
      const parent = nodes.get(top.parent);
      if (!parent || parent.group !== node.group || seen.has(parent.name)) break;
      seen.add(parent.name); top = parent;
    }
    let branch = branches.get(top.name);
    if (!branch) { branch = { root: top, nodes: [], bounds: new Box3(), offset: new Vector3() }; branches.set(top.name, branch); }
    branch.nodes.push(node); branch.bounds.union(node.bounds); branchFor.set(node.name, branch);
  }
  const outwardFor = (branch: LayoutBranch) => {
    if (branch.root === root) return new Vector3(0, 0, 1);
    const outward = center(branch.bounds).sub(origin);
    return outward.lengthSq() > gap * gap ? outward.normalize() : new Vector3(0, 0, 1);
  };

  // Keep the motors in their source relationship and open their brackets,
  // covers and bearings around them. Feet without a motor keep the ankle as
  // their anchor, with the foot and sole opening below it in source order.
  for (const node of nodes.values()) {
    const outward = outwardFor(branchFor.get(node.name)!), occupied: Box3[] = [];
    const rank = (part: LayoutPart) => node.core.has(part) ? 0 : part.part.kind === 'electronics' ? 1 : part.part.kind === 'bearing' ? 3 : part.part.kind === 'shell' ? 4 : 2;
    node.parts.sort((a, b) => rank(a) - rank(b)
      || a.center.distanceTo(node.pivot) / Math.max(a.size.length(), gap) - b.center.distanceTo(node.pivot) / Math.max(b.size.length(), gap)
      || a.part.meshKey.localeCompare(b.part.meshKey) || a.part.id.localeCompare(b.part.id));
    for (const part of node.parts) {
      const direction = partDirection(part, node, outward, gap);
      part.offset.copy(direction).multiplyScalar(clearance([part.bounds], occupied, direction, node.core.has(part) ? gap * .05 : gap));
      occupied.push(part.bounds.clone().translate(part.offset));
    }
  }

  const boxesFor = (node: LayoutBody) => node.parts.map(part => part.bounds.clone().translate(part.offset).translate(node.offset));
  // Lay out each complete branch first. A child follows the parent component
  // at its joint, including that component's internal display offset.
  for (const branch of branches.values()) {
    const placed = new Set<string>(), occupied: Box3[] = [];
    const place = (node: LayoutBody, visiting = new Set<string>()) => {
      if (placed.has(node.name) || visiting.has(node.name)) return;
      visiting.add(node.name);
      const parent = nodes.get(node.parent || '');
      if (parent && branchFor.get(parent.name) === branch) {
        place(parent, visiting);
        node.offset.copy(parent.offset).add(attachment(parent, node, sourceBodies).offset);
        const delta = center(node.bounds).sub(center(parent.bounds));
        let direction = node.axis;
        // If the chain advances across the hinge axis, keep that progression;
        // an ankle directly below a knee should remain in its vertical column.
        if (!direction || Math.abs(delta.dot(direction)) < delta.length() * .2) {
          const axis = COMPONENTS.reduce((best, key, i) => Math.abs(delta[key]) > Math.abs(delta[COMPONENTS[best]]) ? i : best, 0);
          direction = AXES[axis];
        }
        const outward = directed(direction, delta, outwardFor(branch), gap);
        node.offset.addScaledVector(outward, clearance(boxesFor(node), occupied, outward, gap));
      }
      occupied.push(...boxesFor(node)); placed.add(node.name);
    };
    for (const node of branch.nodes) place(node);
  }

  // Move the leg/arm/head branch as a whole, rather than independently sending
  // every descendant to the nearest free axis and losing its assembly chain.
  const placed = new Set<string>(), occupied: Box3[] = [];
  const placeBranch = (branch: LayoutBranch, visiting = new Set<string>()) => {
    if (placed.has(branch.root.name) || visiting.has(branch.root.name)) return;
    visiting.add(branch.root.name);
    const parent = nodes.get(branch.root.parent || ''), parentBranch = parent && branchFor.get(parent.name);
    if (parent && parentBranch && parentBranch !== branch) {
      placeBranch(parentBranch, visiting);
      branch.offset.copy(parentBranch.offset).add(parent.offset).add(attachment(parent, branch.root, sourceBodies).offset);
    }
    const boxes = branch.nodes.flatMap(node => boxesFor(node).map(box => box.translate(branch.offset)));
    const outward = outwardFor(branch);
    branch.offset.addScaledVector(outward, clearance(boxes, occupied, outward, gap * 1.5));
    for (const node of branch.nodes) for (const part of node.parts) {
      const offset = part.offset.clone().add(node.offset).add(branch.offset);
      result.set(part.part.id, offset); occupied.push(part.bounds.clone().translate(offset));
    }
    placed.add(branch.root.name);
  };
  for (const branch of branches.values()) placeBranch(branch);
  return result;
}
