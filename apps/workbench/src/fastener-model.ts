import type { AssemblyFastenerPath, AssemblyFeature, AssemblyInterface, AssemblyMember, GeometrySelection, Part, PrototypeData, Vec3 } from './types';

/** Display geometry is a symbol, not a fastener specification or engagement claim. */
export interface FastenerView {
  id: string;
  connectionRef: string;
  label: string;
  representation: 'schematic';
  ownerRef: string;
  receiverOwnerRef: string;
  entryInterfaceRef: string;
  entryMemberRef: string;
  receiverInterfaceRef: string;
  receiverMemberRef: string;
  entryPosition: Vec3;
  receiverPosition: Vec3;
  inwardAxis: Vec3;
  worldEntry: Vec3;
  worldReceiver: Vec3;
  worldInwardAxis: Vec3;
  display: { shaftRadiusM: number; shaftLengthM: number; headRadiusM: number; headHeightM: number };
  note: string;
}

const sub = (a: Vec3, b: Vec3): Vec3 => a.map((value, index) => value - b[index]) as Vec3;
const add = (a: Vec3, b: Vec3): Vec3 => a.map((value, index) => value + b[index]) as Vec3;
const mul = (a: Vec3, amount: number): Vec3 => a.map(value => value * amount) as Vec3;
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const length = (a: Vec3) => Math.hypot(...a);
const unit = (a: Vec3): Vec3 => mul(a, 1 / length(a));
const finite = (a: number[]) => a.every(Number.isFinite);

function rotate(value: Vec3, quaternion: Part['quaternion']): Vec3 {
  const [x, y, z, w] = quaternion;
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const t = mul(cross([x, y, z], value), 2);
  return add(value, add(mul(t, w), cross([x, y, z], t)));
}

function transform(part: Part, local: Vec3): Vec3 {
  return add(part.position, rotate(local.map((value, index) => value * part.scale[index]) as Vec3, part.quaternion));
}

function transformDirection(part: Part, local: Vec3): Vec3 {
  return unit(rotate(local.map((value, index) => value * part.scale[index]) as Vec3, part.quaternion));
}

interface Endpoint {
  part: Part;
  item: AssemblyInterface;
  member: AssemblyMember;
  feature: AssemblyFeature & { geometry: Extract<AssemblyFeature['geometry'], { type: 'cylinder' }> };
}

function endpoint(data: PrototypeData, ref: AssemblyFastenerPath['receiver']): Endpoint | null {
  const item = data.assembly?.interfaces.find(item => item.id === ref.interface_ref);
  const member = item?.members.find(member => member.id === ref.member_ref);
  const feature = data.assembly?.features.find(feature => feature.id === ref.feature_ref);
  const part = item && data.parts.find(part => part.id === item.owner_ref);
  if (!item || !member || !feature || !part || feature.geometry.type !== 'cylinder' || feature.kind !== 'bore_wall'
    || !member.feature_refs.includes(feature.id) || feature.owner_ref !== item.owner_ref
    || !finite([...part.position, ...part.quaternion, ...part.scale]) || part.scale.some(value => value <= 0)
    || Math.abs(Math.hypot(...part.quaternion) - 1) > 1e-5) return null;
  return { part, item, member, feature: feature as Endpoint['feature'] };
}

function viewForPath(data: PrototypeData, connectionRef: string, path: AssemblyFastenerPath): FastenerView | null {
  const entry = endpoint(data, path.entry), receiver = endpoint(data, path.receiver);
  if (!entry || !receiver || entry.item.id === receiver.item.id || path.kind !== 'screw' || path.representation !== 'schematic') return null;
  const g = entry.feature.geometry, rg = receiver.feature.geometry;
  if (!finite([...g.origin, ...g.axis, ...g.axial_range_m, g.radius_m, ...rg.origin, ...rg.axis, ...rg.axial_range_m, rg.radius_m])
    || Math.abs(length(g.axis) - 1) > 1e-5 || Math.abs(length(rg.axis) - 1) > 1e-5
    || g.axial_range_m[1] <= g.axial_range_m[0] || rg.axial_range_m[1] <= rg.axial_range_m[0] || g.radius_m <= 0 || rg.radius_m <= 0) return null;
  // member.position can be the wall centre. Only the named finite wall side is
  // an authoritative entrance; do not guess an entrance from that centre.
  const side = path.entry.side;
  if (side !== 'low' && side !== 'high') return null;
  const entryPosition = add(g.origin, mul(g.axis, g.axial_range_m[side === 'low' ? 0 : 1]));
  const inwardAxis = mul(g.axis, side === 'low' ? 1 : -1);
  const worldEntry = transform(entry.part, entryPosition), worldAxis = transformDirection(entry.part, inwardAxis);
  const receiverAxis = transformDirection(receiver.part, rg.axis);
  if (Math.abs(dot(worldAxis, receiverAxis)) < .9999) return null;
  const faces = rg.axial_range_m.map(at => {
    const local = add(rg.origin, mul(rg.axis, at)), world = transform(receiver.part, local);
    return { local, world, distance: dot(sub(world, worldEntry), worldAxis) };
  }).sort((a, b) => a.distance - b.distance);
  const ingress = faces[0], delta = sub(ingress.world, worldEntry);
  const radial = sub(delta, mul(worldAxis, ingress.distance));
  if (ingress.distance < -0.00002 || length(radial) > 0.00003) return null;
  const unitScale = length(rotate(inwardAxis.map((value, index) => value * entry.part.scale[index]) as Vec3, entry.part.quaternion));
  const span = ingress.distance / unitScale;
  if (span <= 0.000001) return null;
  const shaftRadiusM = Math.min(g.radius_m, rg.radius_m) * .8;
  return {
    id: path.id, connectionRef, label: '螺钉示意 · 规格待定', representation: 'schematic',
    ownerRef: entry.part.id, receiverOwnerRef: receiver.part.id,
    entryInterfaceRef: entry.item.id, entryMemberRef: entry.member.id,
    receiverInterfaceRef: receiver.item.id, receiverMemberRef: receiver.member.id,
    entryPosition, receiverPosition: ingress.local, inwardAxis,
    worldEntry, worldReceiver: ingress.world, worldInwardAxis: worldAxis,
    display: { shaftRadiusM, shaftLengthM: span, headRadiusM: g.radius_m * 1.65, headHeightM: shaftRadiusM },
    note: path.note || '仅显示至接收孔入口的图形符号；螺钉数量、规格、实际长度及旋入深度未确定。',
  };
}

/** Only explicit member/path choices request a symbol. A whole interface is not a bill of materials. */
export function fastenerViews(data: PrototypeData, selection: GeometrySelection | null): FastenerView[] {
  if (!selection || selection.kind !== 'interface') return [];
  const members = new Set(selection.memberRef ? [selection.memberRef] : selection.memberRefs ?? []);
  if (!members.size && !selection.fastenerRef) return [];
  const results: FastenerView[] = [];
  for (const connection of data.assembly?.connections ?? []) {
    if (connection.manual_decision?.status==='rejected'||connection.basis === 'incompatible' || selection.relationRef && selection.relationRef !== connection.id) continue;
    for (const path of connection.fastener_paths ?? []) {
      if (selection.fastenerRef && selection.fastenerRef !== path.id) continue;
      const match = [path.entry, path.receiver].some(endpoint => endpoint.interface_ref === selection.id && (!members.size || members.has(endpoint.member_ref)));
      if (!match || !connection.endpoints.some(endpoint => endpoint.interface_ref === path.entry.interface_ref)
        || !connection.endpoints.some(endpoint => endpoint.interface_ref === path.receiver.interface_ref)) continue;
      const view = viewForPath(data, connection.id, path);
      const selectedOwner = view && (selection.id === view.entryInterfaceRef ? view.ownerRef : view.receiverOwnerRef);
      if (view && (!selection.ownerRef || selection.ownerRef === selectedOwner)) results.push(view);
    }
  }
  // Competing explanations of one member require an explicit path choice.
  if (!selection.fastenerRef) return results.filter(view => results.filter(other => other.ownerRef === view.ownerRef && other.entryMemberRef === view.entryMemberRef).length === 1);
  return results;
}

export function selectionForFastener(view: FastenerView): GeometrySelection {
  return { kind: 'interface', id: view.entryInterfaceRef, ownerRef: view.ownerRef, memberRef: view.entryMemberRef, relationRef: view.connectionRef, fastenerRef: view.id };
}

export function fastenerExplodedEntry(view: FastenerView, explosion: number, distanceM = .012): Vec3 {
  const amount = Number.isFinite(explosion) ? Math.max(0, Math.min(1, explosion)) : 0;
  return add(view.entryPosition, mul(view.inwardAxis, -amount * distanceM));
}
